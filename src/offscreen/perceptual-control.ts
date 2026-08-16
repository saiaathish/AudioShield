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

/** Exact linear 0-100 representation. Every integer percentage is distinct. */
export const strengthToUnit = (strength: number): number => clamp(strength, 0, 100) / 100;

/**
 * Perceptual control curve for audible processing. It is continuous and strictly
 * increasing from 0..100, but gives mid-range settings enough acoustic authority
 * to be clearly audible instead of spending most of the slider in a near-no-op.
 */
export const perceptualDrive = (strength: number): number => {
  const unit = strengthToUnit(strength);
  return Math.sin(unit * Math.PI / 2);
};

/**
 * Route scores are evidence, not probabilities. This monotonic curve keeps weak
 * evidence weak while making medium/high evidence decisive enough to control the
 * graph. 0 stays 0 and 1 stays 1.
 */
export const routeDrive = (route: number): number => {
  const unit = clamp(route);
  return 1 - (1 - unit) ** 2;
};

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
        flux += clamp((db - (previous as number)) / 24);
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
  const spectralFlux = fluxBins ? clamp(flux / fluxBins * 3.4) : 0;
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
    spectralFlux * 1.45 +
      (ultraHighRatio - 0.20) * 1.55 +
      (highRatio - 0.34) * 0.72 +
      (crest - 4.0) / 5.5 +
      (peak - 0.15) * 0.55 +
      clamp((spectralCentroidHz - 3200) / 6000) * 0.58 -
      speechLikelihood * 0.24,
  );

  const clatterConfidence = clamp(
    (crest - 2.9) / 5.0 +
      (highRatio - 0.29) * 1.32 +
      spectralFlux * 0.82 +
      (peak - 0.15) * 0.58 -
      glassConfidence * 0.18,
  );

  const applauseConfidence = clamp(
    (rms - 0.05) * 3.8 +
      (highRatio - 0.25) * 0.88 +
      spectralFlatness * 0.48 +
      spectralFlux * 0.42 -
      Math.max(0, crest - 6.8) * 0.06 -
      glassConfidence * 0.24,
  );

  const harshConfidence = clamp(
    (highRatio - 0.30) * 1.45 +
      clamp((spectralCentroidHz - 2800) / 5200) * 0.72 +
      spectralFlatness * 0.22,
  );

  const loudnessConfidence = clamp((peak - 0.40) / 0.50 + (rms - 0.10) * 1.95);

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
  const lower = Math.max(1, Math.floor(520 / binHz));
  const upper = Math.min(frequencies.length - 2, Math.ceil(6200 / binHz));
  const raw: Array<{ bin: number; score: number }> = [];

  for (let bin = lower + 5; bin < upper - 5; bin += 1) {
    const level = frequencies[bin] ?? -120;
    if (!Number.isFinite(level) || level < -60) continue;
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
    if (score >= 6.8) raw.push({ bin, score });
  }

  raw.sort((a, b) => b.score - a.score);
  const selected: Array<{ bin: number; score: number }> = [];
  for (const candidate of raw) {
    if (selected.some((item) => Math.abs(item.bin - candidate.bin) * binHz < 150)) continue;
    selected.push(candidate);
    if (selected.length >= maxCandidates) break;
  }

  return selected.map((candidate) => ({
    frequencyHz: candidate.bin * binHz,
    scoreDb: candidate.score,
    confidence: clamp((candidate.score - 6.8) / 15),
  }));
}

export function updateToneTracker(previous: ToneTracker, candidate?: ToneCandidate): ToneTracker {
  if (!candidate) {
    return {
      frequencyHz: previous.frequencyHz,
      confidence: previous.confidence * 0.58,
      persistence: Math.max(0, previous.persistence - 1),
    };
  }

  const toleranceHz = Math.max(155, previous.frequencyHz * 0.09);
  const sameTone = previous.persistence > 0 && Math.abs(candidate.frequencyHz - previous.frequencyHz) <= toleranceHz;
  if (!sameTone) {
    return { frequencyHz: candidate.frequencyHz, confidence: candidate.confidence, persistence: 1 };
  }

  return {
    frequencyHz: previous.frequencyHz * 0.72 + candidate.frequencyHz * 0.28,
    confidence: clamp(previous.confidence * 0.60 + candidate.confidence * 0.40),
    persistence: Math.min(10, previous.persistence + 1),
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
  return Math.min(0.55, 0.34 + harmonicMatches * 0.10);
}

export function computeSensoryRoutes(stats: FrameStats, toneTrackers: readonly ToneTracker[]): SensoryRoutes {
  const stableTones = toneTrackers.filter((tracker) => tracker.persistence >= 2 && tracker.confidence >= 0.12);
  const strongestTone = stableTones.reduce((best, tracker) => Math.max(
    best,
    tracker.confidence * clamp((tracker.persistence - 1) / 4),
  ), 0);
  const multiToneBonus = stableTones.length >= 2 ? Math.min(0.16, (stableTones.length - 1) * 0.08) : 0;

  const musicPenalty = harmonicStackPenalty(stableTones);
  const structuredAudioGuard = 1 - stats.speechLikelihood * 0.42;
  const alarmRaw = clamp((strongestTone + multiToneBonus) * structuredAudioGuard * (1 - musicPenalty));
  const alarm = routeDrive(alarmRaw);

  const glass = routeDrive(stats.glassConfidence);
  const clatter = routeDrive(stats.clatterConfidence * (1 - glass * 0.62));
  const applause = routeDrive(stats.applauseConfidence * (1 - glass * 0.52));
  const harsh = routeDrive(stats.harshConfidence);
  const loudness = routeDrive(stats.loudnessConfidence);
  const foregroundDominance = Math.max(alarm, glass, clatter, applause, loudness, harsh * 0.58);

  // When a foreground route becomes convincing, broad denoising should back off
  // aggressively instead of continuing to own most of the audible change. This
  // remains continuous: no threshold or binary switch is introduced.
  const backgroundBase = routeDrive(stats.backgroundConfidence);
  const foregroundRelease = (1 - foregroundDominance) ** 2.2;
  const background = clamp(backgroundBase * foregroundRelease);

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
  const speechGuard = 1 - input.stats.speechLikelihood * 0.30;

  const dynamicHighCut = (
    input.envelopes.glass * glass * 15.5 +
    input.envelopes.clatter * clatter * 9.5 +
    input.envelopes.applause * applause * 5.8
  ) * speechGuard;
  const steadyHarshCut = harsh * input.routes.harsh * 10.5;
  const highShelfDb = -Math.min(19, steadyHarshCut + dynamicHighCut);

  const transientDb = -Math.min(12.5, (
    input.envelopes.glass * glass * 10.5 +
    input.envelopes.clatter * clatter * 6.5 +
    input.envelopes.applause * applause * 3.1 +
    input.envelopes.loudness * loudness * 8.2
  ) * speechGuard);

  const impact = clamp(
    input.envelopes.glass * glass * 1.08 +
    input.envelopes.clatter * clatter * 0.78 +
    input.envelopes.applause * applause * 0.48 +
    input.envelopes.loudness * loudness * 1.08,
  );

  const safetyAmount = Math.max(harsh, glass, clatter, applause, loudness, background);

  return {
    highShelfDb,
    transientGain: dbToGain(transientDb),
    compressorThresholdDb: -24 * impact,
    compressorRatio: 1 + impact * 5.5,
    compressorAttack: 0.008 - impact * 0.0065,
    compressorRelease: 0.09 + impact * 0.16,
    limiterThresholdDb: -3.2 * safetyAmount,
    limiterRatio: 1 + safetyAmount * 19,
    // Restore a little presence after neural suppression, but do not undo harsh
    // high-frequency protection during a foreground sensory event.
    presenceDb: clamp(input.neuralMix * (0.58 + background * 1.9) - harsh * 0.50, 0, 2.4),
  };
}
