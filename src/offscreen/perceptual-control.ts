export const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const dbToPower = (db: number): number => 10 ** (db / 10);
const dbToGain = (db: number): number => 10 ** (db / 20);

export interface FrameStats {
  peak: number;
  rms: number;
  crest: number;
  highRatio: number;
  spectralFlatness: number;
  speechLikelihood: number;
  clatterConfidence: number;
  applauseConfidence: number;
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
  clatter: number;
  applause: number;
  loudness: number;
}

export interface DynamicProfile {
  highShelfDb: number;
  transientGain: number;
  compressorThresholdDb: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  presenceDb: number;
}

export function computeFrameStats(
  frequencies: Float32Array,
  waveform: Float32Array,
  sampleRate: number,
  fftSize: number,
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
  let midPower = 0;
  let highBins = 0;
  let midBins = 0;
  let flatnessLog = 0;
  let flatnessPower = 0;
  let flatnessBins = 0;

  for (let bin = 1; bin < frequencies.length; bin += 1) {
    const hz = bin * binHz;
    const db = frequencies[bin] ?? -120;
    if (!Number.isFinite(db)) continue;
    const power = Math.max(1e-12, dbToPower(db));
    if (hz >= 2400 && hz <= 10500) {
      highPower += power;
      highBins += 1;
    } else if (hz >= 180 && hz < 2400) {
      midPower += power;
      midBins += 1;
    }
    if (hz >= 180 && hz <= 9000) {
      flatnessLog += Math.log(power);
      flatnessPower += power;
      flatnessBins += 1;
    }
  }

  const highAverage = highPower / Math.max(1, highBins);
  const midAverage = midPower / Math.max(1, midBins);
  const highRatio = highAverage / Math.max(1e-12, highAverage + midAverage);
  const geometricMean = Math.exp(flatnessLog / Math.max(1, flatnessBins));
  const arithmeticMean = flatnessPower / Math.max(1, flatnessBins);
  const spectralFlatness = clamp(geometricMean / Math.max(1e-12, arithmeticMean));

  // Speech is usually structured/harmonic rather than spectrally flat. This is
  // intentionally conservative: the guard only softens sensory processing; it
  // never declares content to be speech with product-level certainty.
  const harmonicStructure = clamp((0.34 - spectralFlatness) / 0.28);
  const speechCrest = clamp(1 - Math.abs(crest - 4.2) / 4.2);
  const speechLikelihood = clamp(harmonicStructure * 0.76 + speechCrest * 0.24);

  const clatterConfidence = clamp(
    (crest - 3.0) / 5.0 + (highRatio - 0.31) * 1.45 + (peak - 0.16) * 0.65,
  );
  const applauseConfidence = clamp(
    (rms - 0.055) * 3.6 + (highRatio - 0.26) * 0.9 + spectralFlatness * 0.5 - Math.max(0, crest - 6.5) * 0.05,
  );
  const loudnessConfidence = clamp((peak - 0.42) / 0.48 + (rms - 0.11) * 1.9);

  return {
    peak,
    rms,
    crest,
    highRatio,
    spectralFlatness,
    speechLikelihood,
    clatterConfidence,
    applauseConfidence,
    loudnessConfidence,
  };
}

export function findToneCandidates(
  frequencies: Float32Array,
  sampleRate: number,
  fftSize: number,
  maxCandidates = 2,
): ToneCandidate[] {
  const binHz = sampleRate / fftSize;
  const lower = Math.max(1, Math.floor(650 / binHz));
  const upper = Math.min(frequencies.length - 2, Math.ceil(5200 / binHz));
  const raw: Array<{ bin: number; score: number }> = [];

  for (let bin = lower + 5; bin < upper - 5; bin += 1) {
    const level = frequencies[bin] ?? -120;
    if (!Number.isFinite(level) || level < -58) continue;
    let neighbor = 0;
    let count = 0;
    for (let offset = -6; offset <= 6; offset += 1) {
      if (Math.abs(offset) <= 1) continue;
      const value = frequencies[bin + offset];
      if (Number.isFinite(value)) {
        neighbor += value!;
        count += 1;
      }
    }
    if (!count) continue;
    const score = level - neighbor / count;
    if (score >= 7.5) raw.push({ bin, score });
  }

  raw.sort((a, b) => b.score - a.score);
  const selected: Array<{ bin: number; score: number }> = [];
  for (const candidate of raw) {
    if (selected.some((item) => Math.abs(item.bin - candidate.bin) * binHz < 180)) continue;
    selected.push(candidate);
    if (selected.length >= maxCandidates) break;
  }

  return selected.map((candidate) => ({
    frequencyHz: candidate.bin * binHz,
    scoreDb: candidate.score,
    confidence: clamp((candidate.score - 7.5) / 15),
  }));
}

export function updateToneTracker(previous: ToneTracker, candidate?: ToneCandidate): ToneTracker {
  if (!candidate) {
    return {
      frequencyHz: previous.frequencyHz,
      confidence: previous.confidence * 0.55,
      persistence: Math.max(0, previous.persistence - 1),
    };
  }

  const toleranceHz = Math.max(190, previous.frequencyHz * 0.11);
  const sameTone = previous.persistence > 0 && Math.abs(candidate.frequencyHz - previous.frequencyHz) <= toleranceHz;
  if (!sameTone) {
    return { frequencyHz: candidate.frequencyHz, confidence: candidate.confidence, persistence: 1 };
  }

  return {
    frequencyHz: previous.frequencyHz * 0.68 + candidate.frequencyHz * 0.32,
    confidence: clamp(previous.confidence * 0.58 + candidate.confidence * 0.42),
    persistence: Math.min(8, previous.persistence + 1),
  };
}

export function updateEnvelope(current: number, detection: number, release = 0.76): number {
  const detected = clamp(detection);
  if (detected > current) return detected;
  return clamp(current * clamp(release, 0, 0.995));
}

export function computeDynamicProfile(input: {
  harshStrength: number;
  clatterStrength: number;
  applauseStrength: number;
  loudnessStrength: number;
  backgroundStrength: number;
  stats: FrameStats;
  envelopes: EventEnvelopes;
  neuralActive: boolean;
}): DynamicProfile {
  const harsh = clamp(input.harshStrength, 0, 100) / 100;
  const clatter = clamp(input.clatterStrength, 0, 100) / 100;
  const applause = clamp(input.applauseStrength, 0, 100) / 100;
  const loudness = clamp(input.loudnessStrength, 0, 100) / 100;
  const background = clamp(input.backgroundStrength, 0, 100) / 100;
  const speechGuard = 1 - input.stats.speechLikelihood * 0.46;

  // Only the explicit harsh-highs rule applies a steady tonal-color change.
  // Clatter/applause/loudness are transient envelopes, which keeps normal
  // dialogue and music from sounding permanently dull or crushed.
  const dynamicHighCut = (
    input.envelopes.clatter * clatter * 6.2 +
    input.envelopes.applause * applause * 4.2
  ) * speechGuard;
  const highShelfDb = -Math.min(12.5, harsh * 7.5 + dynamicHighCut);

  const transientDb = -Math.min(5.5, (
    input.envelopes.clatter * clatter * 3.2 +
    input.envelopes.applause * applause * 1.8 +
    input.envelopes.loudness * loudness * 4.4
  ) * speechGuard);

  const impact = clamp(
    input.envelopes.clatter * clatter * 0.7 +
    input.envelopes.applause * applause * 0.45 +
    input.envelopes.loudness * loudness,
  );

  return {
    highShelfDb,
    transientGain: dbToGain(transientDb),
    compressorThresholdDb: -5.5 - impact * 12.5,
    compressorRatio: 1.25 + impact * 3.7,
    compressorAttack: Math.max(0.0018, 0.008 - impact * 0.0055),
    compressorRelease: 0.11 + impact * 0.11,
    // Gentle post-neural presence recovery counters the "blanket over speech"
    // effect without attempting to reconstruct frequencies the model removed.
    presenceDb: input.neuralActive ? clamp(0.45 + background * 1.45 - harsh * 0.65, 0, 1.9) : 0,
  };
}
