export const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const dbToPower = (db: number): number => 10 ** (db / 10);
const dbToGain = (db: number): number => 10 ** (db / 20);

export interface FrameStats {
  peak: number;
  rms: number;
  crest: number;
  highRatio: number;
  ultraHighRatio: number;
  spectralFlatness: number;
  spectralFlux: number;
  spectralCentroidHz: number;
  speechLikelihood: number;
  backgroundConfidence: number;
  glassConfidence: number;
  clatterConfidence: number;
  applauseConfidence: number;
  harshConfidence: number;
  loudnessConfidence: number;
}

export interface ToneCandidate {
  frequencyHz: number;
  confidence: number;
  scoreDb: number;
}

export interface ToneTracker {
  frequencyHz: number;
  confidence: number;
  persistence: number;
}

export interface EventEnvelopes {
  glass: number;
  clatter: number;
  applause: number;
  loudness: number;
}

export interface SensoryRoutes {
  background: number;
  alarm: number;
  glass: number;
  clatter: number;
  applause: number;
  harsh: number;
  loudness: number;
  foregroundDominance: number;
}

export interface DynamicProfile {
  highShelfDb: number;
  transientGain: number;
  compressorThresholdDb: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  limiterThresholdDb: number;
  limiterRatio: number;
  presenceDb: number;
}

/** Exact 0-100 input representation. Every integer percentage remains distinct. */
export const strengthToUnit = (strength: number): number => clamp(strength, 0, 100) / 100;

/**
 * Smooth perceptual drive. There is no threshold or plateau: every higher input
 * produces a higher processing amount, while the middle of the slider is no
 * longer acoustically timid.
 */
export const perceptualDrive = (strength: number): number => {
  const unit = strengthToUnit(strength);
  return Math.sin(unit * Math.PI / 2);
};

/** Route scores are evidence, not probabilities. Make medium/high evidence decisive. */
export const routeDrive = (route: number): number => {
  const unit = clamp(route);
  return 1 - (1 - unit) ** 2;
};

/**
 * Compose profile + master controls without the old double-attenuation problem.
 * 0 stays 0, 100/100 stays 100, and every intermediate value remains unique.
 */
export function composeProtectionStrength(profileStrength: number, masterStrength: number): number {
  const product = strengthToUnit(profileStrength) * strengthToUnit(masterStrength);
  if (product <= 0) return 0;
  if (product >= 1) return 100;
  return (1 - Math.pow(1 - product, 1.55)) * 100;
}

/**
 * Both packaged suppressors buffer audio before returning enhanced samples.
 * GTCRN at 48 kHz uses 768-sample frames over 128-sample render quanta, which
 * yields 640 samples of graph delay. The packaged RNNoise path also explicitly
 * uses a 640-sample delay. Aligning the dry path makes partial wet/dry mixes
 * usable instead of comb-filtering speech.
 */
export function neuralDelaySeconds(engine: "gtcrn" | "rnnoise" | "native-sensory", sampleRate: number): number {
  if (engine === "native-sensory" || !Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  if (engine === "gtcrn" && sampleRate <= 20_000) return 128 / sampleRate;
  return 640 / sampleRate;
}

export const continuousNeuralMix = (backgroundStrength: number, backgroundRoute: number): number =>
  perceptualDrive(backgroundStrength) * routeDrive(backgroundRoute);

export function computeFrameStats(
  frequencies: Float32Array,
  waveform: Float32Array,
  sampleRate: number,
  fftSize: number,
  previousFrequencies?: Float32Array,
): FrameStats {
  let peak = 0;
  let sumSq = 0;
  for (const sample of waveform) {
    const finite = Number.isFinite(sample) ? sample : 0;
    const abs = Math.abs(finite);
    peak = Math.max(peak, abs);
    sumSq += finite * finite;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, waveform.length));
  const crest = peak / Math.max(1e-5, rms);

  const binHz = sampleRate / fftSize;
  let highPower = 0;
  let ultraHighPower = 0;
  let midPower = 0;
  let totalPower = 0;
  let weightedFrequency = 0;
  let highBins = 0;
  let ultraHighBins = 0;
  let midBins = 0;
  let flatnessLog = 0;
  let flatnessPower = 0;
  let flatnessBins = 0;
  let flux = 0;
  let fluxBins = 0;

  for (let bin = 1; bin < frequencies.length; bin += 1) {
    const hz = bin * binHz;
    const db = frequencies[bin] ?? -120;
    if (!Number.isFinite(db)) continue;
    const power = Math.max(1e-12, dbToPower(db));

    if (hz >= 2400 && hz <= 12_000) {
      highPower += power;
      highBins += 1;
    }
    if (hz >= 5200 && hz <= 16_000) {
      ultraHighPower += power;
      ultraHighBins += 1;
    }
    if (hz >= 180 && hz < 2400) {
      midPower += power;
      midBins += 1;
    }
    if (hz >= 120 && hz <= 16_000) {
      totalPower += power;
      weightedFrequency += power * hz;
    }
    if (hz >= 180 && hz <= 12_000) {
      flatnessLog += Math.log(power);
      flatnessPower += power;
      flatnessBins += 1;
      const previous = previousFrequencies?.[bin];
      if (Number.isFinite(previous)) {
        flux += clamp((db - (previous as number)) / 20);
        fluxBins += 1;
      }
    }
  }

  const highAverage = highPower / Math.max(1, highBins);
  const ultraHighAverage = ultraHighPower / Math.max(1, ultraHighBins);
  const midAverage = midPower / Math.max(1, midBins);
  const highRatio = highAverage / Math.max(1e-12, highAverage + midAverage);
  const ultraHighRatio = ultraHighAverage / Math.max(1e-12, ultraHighAverage + midAverage);
  const geometricMean = Math.exp(flatnessLog / Math.max(1, flatnessBins));
  const arithmeticMean = flatnessPower / Math.max(1, flatnessBins);
  const spectralFlatness = clamp(geometricMean / Math.max(1e-12, arithmeticMean));
  const spectralFlux = fluxBins ? clamp(flux / fluxBins * 4.1) : 0;
  const spectralCentroidHz = totalPower > 0 ? weightedFrequency / totalPower : 0;

  const harmonicStructure = clamp((0.38 - spectralFlatness) / 0.32);
  const speechCrest = clamp(1 - Math.abs(crest - 4.0) / 4.2);
  const speechBand = clamp(1 - Math.abs(spectralCentroidHz - 1750) / 2800);
  const speechLikelihood = clamp(
    harmonicStructure * 0.56 + speechCrest * 0.18 + speechBand * 0.26 - spectralFlux * 0.18,
  );

  const stationary = 1 - clamp(spectralFlux * 2.1);
  const noiseTexture = clamp((spectralFlatness - 0.12) / 0.58);
  const steadyAmplitude = clamp((5.4 - crest) / 4.2);
  const audible = clamp((rms - 0.008) / 0.11);
  const backgroundConfidence = clamp(
    noiseTexture * 0.39 + stationary * 0.29 + steadyAmplitude * 0.18 + audible * 0.14 - speechLikelihood * 0.38,
  );

  const glassConfidence = clamp(
    spectralFlux * 1.82 +
      (ultraHighRatio - 0.17) * 1.82 +
      (highRatio - 0.31) * 0.88 +
      (crest - 3.7) / 4.8 +
      (peak - 0.12) * 0.72 +
      clamp((spectralCentroidHz - 2900) / 5600) * 0.66 -
      speechLikelihood * 0.20,
  );

  const clatterConfidence = clamp(
    (crest - 2.7) / 4.4 +
      (highRatio - 0.27) * 1.45 +
      spectralFlux * 0.98 +
      (peak - 0.12) * 0.68 -
      glassConfidence * 0.22,
  );

  const applauseConfidence = clamp(
    (rms - 0.045) * 4.2 +
      (highRatio - 0.23) * 0.94 +
      spectralFlatness * 0.52 +
      spectralFlux * 0.48 -
      Math.max(0, crest - 6.8) * 0.06 -
      glassConfidence * 0.27,
  );

  const harshConfidence = clamp(
    (highRatio - 0.27) * 1.58 +
      clamp((spectralCentroidHz - 2600) / 5000) * 0.80 +
      spectralFlatness * 0.24,
  );

  const loudnessConfidence = clamp((peak - 0.34) / 0.48 + (rms - 0.085) * 2.2);

  return {
    peak,
    rms,
    crest,
    highRatio,
    ultraHighRatio,
    spectralFlatness,
    spectralFlux,
    spectralCentroidHz,
    speechLikelihood,
    backgroundConfidence,
    glassConfidence,
    clatterConfidence,
    applauseConfidence,
    harshConfidence,
    loudnessConfidence,
  };
}

export function findToneCandidates(
  frequencies: Float32Array,
  sampleRate: number,
  fftSize: number,
  maxCandidates = 3,
): ToneCandidate[] {
  const binHz = sampleRate / fftSize;
  const lower = Math.max(1, Math.floor(480 / binHz));
  const upper = Math.min(frequencies.length - 2, Math.ceil(7000 / binHz));
  const raw: Array<{ bin: number; score: number }> = [];

  for (let bin = lower + 5; bin < upper - 5; bin += 1) {
    const level = frequencies[bin] ?? -120;
    if (!Number.isFinite(level) || level < -66) continue;
    let neighbor = 0;
    let count = 0;
    for (let offset = -7; offset <= 7; offset += 1) {
      if (Math.abs(offset) <= 1) continue;
      const value = frequencies[bin + offset];
      if (Number.isFinite(value)) {
        neighbor += value as number;
        count += 1;
      }
    }
    if (!count) continue;
    const score = level - neighbor / count;
    if (score >= 4.8) raw.push({ bin, score });
  }

  raw.sort((a, b) => b.score - a.score);
  const selected: Array<{ bin: number; score: number }> = [];
  for (const candidate of raw) {
    if (selected.some((item) => Math.abs(item.bin - candidate.bin) * binHz < 125)) continue;
    selected.push(candidate);
    if (selected.length >= maxCandidates) break;
  }

  return selected.map((candidate) => ({
    frequencyHz: candidate.bin * binHz,
    scoreDb: candidate.score,
    confidence: clamp((candidate.score - 4.8) / 10.5),
  }));
}

export function updateToneTracker(previous: ToneTracker, candidate?: ToneCandidate): ToneTracker {
  if (!candidate) {
    return {
      frequencyHz: previous.frequencyHz,
      confidence: previous.confidence * 0.68,
      persistence: Math.max(0, previous.persistence - 1),
    };
  }

  const toleranceHz = Math.max(175, previous.frequencyHz * 0.12);
  const sameTone = previous.persistence > 0 && Math.abs(candidate.frequencyHz - previous.frequencyHz) <= toleranceHz;
  if (!sameTone) {
    return { frequencyHz: candidate.frequencyHz, confidence: candidate.confidence, persistence: 1 };
  }

  return {
    frequencyHz: previous.frequencyHz * 0.66 + candidate.frequencyHz * 0.34,
    confidence: clamp(previous.confidence * 0.52 + candidate.confidence * 0.48),
    persistence: Math.min(12, previous.persistence + 1),
  };
}

function harmonicStackPenalty(stableTones: readonly ToneTracker[]): number {
  if (stableTones.length < 2) return 0;
  const sorted = [...stableTones].sort((a, b) => a.frequencyHz - b.frequencyHz);
  const base = sorted[0]?.frequencyHz ?? 0;
  if (base <= 0 || base > 950) return 0;

  let harmonicMatches = 0;
  for (const tone of sorted.slice(1)) {
    const ratio = tone.frequencyHz / base;
    const nearest = Math.round(ratio);
    if (nearest >= 2 && nearest <= 6 && Math.abs(ratio - nearest) <= 0.065) harmonicMatches += 1;
  }
  if (!harmonicMatches) return 0;
  return Math.min(0.58, 0.36 + harmonicMatches * 0.11);
}

export function computeSensoryRoutes(stats: FrameStats, toneTrackers: readonly ToneTracker[]): SensoryRoutes {
  const stableTones = toneTrackers.filter((tracker) => tracker.persistence >= 2 && tracker.confidence >= 0.10);
  const strongestTone = stableTones.reduce((best, tracker) => Math.max(
    best,
    tracker.confidence * (0.48 + 0.52 * clamp((tracker.persistence - 1) / 4)),
  ), 0);
  const multiToneBonus = stableTones.length >= 2 ? Math.min(0.22, (stableTones.length - 1) * 0.11) : 0;

  const musicPenalty = harmonicStackPenalty(stableTones);
  const structuredAudioGuard = 1 - stats.speechLikelihood * 0.28;
  const alarmRaw = clamp((strongestTone * 1.22 + multiToneBonus) * structuredAudioGuard * (1 - musicPenalty));
  const alarm = routeDrive(alarmRaw);

  const glass = routeDrive(stats.glassConfidence);
  const clatter = routeDrive(stats.clatterConfidence * (1 - glass * 0.62));
  const applause = routeDrive(stats.applauseConfidence * (1 - glass * 0.52));
  const harsh = routeDrive(stats.harshConfidence);
  const loudness = routeDrive(stats.loudnessConfidence);
  const foregroundDominance = Math.max(alarm, glass, clatter, applause, loudness, harsh * 0.62);

  const backgroundBase = routeDrive(stats.backgroundConfidence);
  const background = clamp(backgroundBase * (1 - foregroundDominance) ** 2.4);

  return { background, alarm, glass, clatter, applause, harsh, loudness, foregroundDominance };
}

export function updateEnvelope(current: number, detection: number, release = 0.76): number {
  const detected = clamp(detection);
  if (detected > current) return detected;
  return clamp(current * clamp(release, 0, 0.995));
}

export function computeDynamicProfile(input: {
  harshStrength: number;
  glassStrength: number;
  clatterStrength: number;
  applauseStrength: number;
  loudnessStrength: number;
  backgroundStrength: number;
  stats: FrameStats;
  envelopes: EventEnvelopes;
  routes: SensoryRoutes;
  neuralMix: number;
}): DynamicProfile {
  const harsh = perceptualDrive(input.harshStrength);
  const glass = perceptualDrive(input.glassStrength);
  const clatter = perceptualDrive(input.clatterStrength);
  const applause = perceptualDrive(input.applauseStrength);
  const loudness = perceptualDrive(input.loudnessStrength);
  const background = perceptualDrive(input.backgroundStrength);
  const speechGuard = 1 - input.stats.speechLikelihood * 0.24;

  const dynamicHighCut = (
    input.envelopes.glass * glass * 16.0 +
    input.envelopes.clatter * clatter * 10.0 +
    input.envelopes.applause * applause * 6.0
  ) * speechGuard;
  const steadyHarshCut = harsh * input.routes.harsh * 11.0;
  const highShelfDb = -Math.min(20, steadyHarshCut + dynamicHighCut);

  const transientDb = -Math.min(13, (
    input.envelopes.glass * glass * 11.0 +
    input.envelopes.clatter * clatter * 6.8 +
    input.envelopes.applause * applause * 3.4 +
    input.envelopes.loudness * loudness * 8.8
  ) * speechGuard);

  const impact = clamp(
    input.envelopes.glass * glass * 1.15 +
    input.envelopes.clatter * clatter * 0.82 +
    input.envelopes.applause * applause * 0.50 +
    input.envelopes.loudness * loudness * 1.10,
  );

  // Only routed evidence drives the dynamics. Slider settings alone must not
  // compress the entire tab and mask the category-specific audible changes.
  const routedSafety = Math.max(
    harsh * input.routes.harsh,
    glass * input.envelopes.glass,
    clatter * input.envelopes.clatter,
    applause * input.envelopes.applause,
    loudness * input.envelopes.loudness,
    background * input.neuralMix * 0.30,
  );

  return {
    highShelfDb,
    transientGain: dbToGain(transientDb),
    compressorThresholdDb: -24 * impact,
    compressorRatio: 1 + impact * 6.5,
    compressorAttack: 0.007 - impact * 0.0055,
    compressorRelease: 0.085 + impact * 0.16,
    limiterThresholdDb: -4.0 * routedSafety,
    limiterRatio: 1 + routedSafety * 20,
    presenceDb: clamp(input.neuralMix * (0.50 + background * 1.7) - harsh * 0.34, 0, 2.4),
  };
}
