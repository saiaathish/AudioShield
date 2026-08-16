import { describe, expect, it } from "vitest";
import {
  composeProtectionStrength,
  computeDynamicProfile,
  computeFrameStats,
  computeSensoryRoutes,
  continuousNeuralMix,
  findToneCandidates,
  neuralDelaySeconds,
  perceptualDrive,
  routeDrive,
  strengthToUnit,
  updateEnvelope,
  updateToneTracker,
  type FrameStats,
  type ToneTracker,
} from "../src/offscreen/perceptual-control";
import {
  ANALYSIS_FFT_SIZE,
  ANALYSIS_INTERVAL_MS,
  EVENT_LOOKAHEAD_SECONDS,
} from "../src/offscreen/sensory-engine";

function flatSpectrum(db: number, bins = 1024): Float32Array {
  return new Float32Array(bins).fill(db);
}

function speechLikeWave(length = 2048): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = 0.12 * Math.sin(2 * Math.PI * 180 * i / 48_000)
      + 0.06 * Math.sin(2 * Math.PI * 360 * i / 48_000)
      + 0.03 * Math.sin(2 * Math.PI * 720 * i / 48_000);
  }
  return out;
}

function stats(overrides: Partial<FrameStats> = {}): FrameStats {
  return {
    peak: 0.2,
    rms: 0.06,
    crest: 3.3,
    highRatio: 0.25,
    ultraHighRatio: 0.12,
    spectralFlatness: 0.25,
    spectralFlux: 0.05,
    spectralCentroidHz: 1800,
    speechLikelihood: 0.2,
    backgroundConfidence: 0.2,
    glassConfidence: 0,
    clatterConfidence: 0,
    applauseConfidence: 0,
    harshConfidence: 0,
    loudnessConfidence: 0,
    ...overrides,
  };
}

describe("perceptual control v5", () => {
  it("keeps 0-100 continuous while making the mid-range perceptually useful", () => {
    expect(strengthToUnit(0)).toBe(0);
    expect(strengthToUnit(100)).toBe(1);
    expect(perceptualDrive(0)).toBe(0);
    expect(perceptualDrive(100)).toBeCloseTo(1, 10);

    let previousDrive = -1;
    let previousMix = -1;
    for (let value = 0; value <= 100; value += 1) {
      const drive = perceptualDrive(value);
      const mix = continuousNeuralMix(value, 1);
      expect(drive).toBeGreaterThan(previousDrive);
      expect(mix).toBeGreaterThan(previousMix);
      previousDrive = drive;
      previousMix = mix;
    }
    expect(perceptualDrive(50)).toBeGreaterThan(0.70);
  });

  it("composes master and profile strength without collapsing useful settings", () => {
    expect(composeProtectionStrength(0, 100)).toBe(0);
    expect(composeProtectionStrength(100, 0)).toBe(0);
    expect(composeProtectionStrength(100, 100)).toBe(100);
    expect(composeProtectionStrength(82, 65)).toBeGreaterThan(65);

    let previous = -1;
    for (let value = 0; value <= 100; value += 1) {
      const composed = composeProtectionStrength(82, value);
      expect(composed).toBeGreaterThan(previous);
      previous = composed;
    }
  });

  it("turns medium route evidence into decisive but continuous control", () => {
    expect(routeDrive(0)).toBe(0);
    expect(routeDrive(1)).toBe(1);
    expect(routeDrive(0.5)).toBeCloseTo(0.75, 8);
    for (let i = 1; i <= 100; i += 1) {
      expect(routeDrive(i / 100)).toBeGreaterThan(routeDrive((i - 1) / 100));
    }
  });

  it("uses a delay-aligned dry path for partial GTCRN/RNNoise mixing", () => {
    expect(neuralDelaySeconds("gtcrn", 48_000)).toBeCloseTo(640 / 48_000, 10);
    expect(neuralDelaySeconds("rnnoise", 48_000)).toBeCloseTo(640 / 48_000, 10);
    expect(neuralDelaySeconds("gtcrn", 16_000)).toBeCloseTo(128 / 16_000, 10);
    expect(neuralDelaySeconds("native-sensory", 48_000)).toBe(0);
  });

  it("keeps transient analysis inside the lookahead budget", () => {
    const analysisWindowMs = ANALYSIS_FFT_SIZE / 48_000 * 1000;
    expect(ANALYSIS_FFT_SIZE).toBe(1024);
    expect(analysisWindowMs).toBeLessThan(22);
    expect(ANALYSIS_INTERVAL_MS).toBeLessThanOrEqual(16);
    expect(EVENT_LOOKAHEAD_SECONDS * 1000).toBeGreaterThanOrEqual(32);
  });

  it("keeps every processing stage transparent at 0%", () => {
    const frame = computeFrameStats(flatSpectrum(-82), speechLikeWave(), 48_000, 2048);
    const profile = computeDynamicProfile({
      harshStrength: 0,
      glassStrength: 0,
      clatterStrength: 0,
      applauseStrength: 0,
      loudnessStrength: 0,
      backgroundStrength: 0,
      stats: frame,
      envelopes: { glass: 0, clatter: 0, applause: 0, loudness: 0 },
      routes: computeSensoryRoutes(frame, []),
      neuralMix: 0,
    });

    expect(profile.highShelfDb).toBeCloseTo(0, 8);
    expect(profile.transientGain).toBeCloseTo(1, 8);
    expect(profile.compressorRatio).toBeCloseTo(1, 8);
    expect(profile.compressorThresholdDb).toBeCloseTo(0, 8);
    expect(profile.limiterRatio).toBeCloseTo(1, 8);
    expect(profile.limiterThresholdDb).toBeCloseTo(0, 8);
    expect(profile.presenceDb).toBeCloseTo(0, 8);
  });

  it("does not compress the whole tab just because protections are enabled", () => {
    const frame = stats({ harshConfidence: 0, backgroundConfidence: 0 });
    const profile = computeDynamicProfile({
      harshStrength: 100,
      glassStrength: 100,
      clatterStrength: 100,
      applauseStrength: 100,
      loudnessStrength: 100,
      backgroundStrength: 100,
      stats: frame,
      envelopes: { glass: 0, clatter: 0, applause: 0, loudness: 0 },
      routes: { background: 0, alarm: 0, glass: 0, clatter: 0, applause: 0, harsh: 0, loudness: 0, foregroundDominance: 0 },
      neuralMix: 0,
    });
    expect(profile.compressorRatio).toBe(1);
    expect(profile.compressorThresholdDb).toBe(0);
    expect(profile.limiterRatio).toBe(1);
    expect(profile.limiterThresholdDb).toBeCloseTo(0, 8);
  });

  it("routes a persistent house-alarm tone ahead of broad background denoising", () => {
    const frame = stats({ backgroundConfidence: 0.92, spectralFlatness: 0.55 });
    const trackers: ToneTracker[] = [
      { frequencyHz: 2800, confidence: 0.92, persistence: 6 },
      { frequencyHz: 3400, confidence: 0.78, persistence: 5 },
    ];
    const routes = computeSensoryRoutes(frame, trackers);
    expect(routes.alarm).toBeGreaterThan(0.85);
    expect(routes.background).toBeLessThan(0.1);
    expect(routes.alarm).toBeGreaterThan(routes.background);
  });

  it("keeps low musical harmonic stacks below a decisive alarm route", () => {
    const frame = stats({ speechLikelihood: 0.82, backgroundConfidence: 0.18 });
    const trackers: ToneTracker[] = [
      { frequencyHz: 700, confidence: 0.94, persistence: 6 },
      { frequencyHz: 1400, confidence: 0.90, persistence: 6 },
      { frequencyHz: 2100, confidence: 0.84, persistence: 5 },
    ];
    const routes = computeSensoryRoutes(frame, trackers);
    expect(routes.alarm).toBeLessThan(0.75);
  });

  it("routes glass-like brittle energy ahead of background and ordinary clatter", () => {
    const frame = stats({
      backgroundConfidence: 0.88,
      glassConfidence: 0.95,
      clatterConfidence: 0.82,
      spectralFlux: 0.9,
      ultraHighRatio: 0.8,
      crest: 8,
    });
    const routes = computeSensoryRoutes(frame, []);
    expect(routes.glass).toBeGreaterThan(routes.clatter);
    expect(routes.glass).toBeGreaterThan(0.95);
    expect(routes.background).toBeLessThan(0.05);
  });

  it("lets harsh foreground energy suppress broad background ownership", () => {
    const frame = stats({
      backgroundConfidence: 0.9,
      harshConfidence: 0.95,
      highRatio: 0.88,
      spectralCentroidHz: 6800,
    });
    const routes = computeSensoryRoutes(frame, []);
    expect(routes.harsh).toBeGreaterThan(0.99);
    expect(routes.background).toBeLessThan(0.2);
  });

  it("detects a synthetic brittle high-frequency transient as glass-like", () => {
    const previous = flatSpectrum(-82);
    const frequencies = flatSpectrum(-82);
    const waveform = new Float32Array(2048);
    waveform[100] = 0.95;
    waveform[101] = -0.72;
    const binHz = 48_000 / 2048;
    for (let hz = 5200; hz <= 12_000; hz += 180) {
      frequencies[Math.round(hz / binHz)] = -20;
    }
    const frame = computeFrameStats(frequencies, waveform, 48_000, 2048, previous);
    expect(frame.glassConfidence).toBeGreaterThan(frame.backgroundConfidence);
    expect(frame.spectralFlux).toBeGreaterThan(0.1);
  });

  it("makes event suppression temporary instead of permanently dulling audio", () => {
    let envelope = 0;
    envelope = updateEnvelope(envelope, 0.95, 0.7);
    expect(envelope).toBeCloseTo(0.95, 6);
    envelope = updateEnvelope(envelope, 0, 0.7);
    expect(envelope).toBeLessThan(0.95);
    for (let i = 0; i < 12; i += 1) envelope = updateEnvelope(envelope, 0, 0.7);
    expect(envelope).toBeLessThan(0.02);
  });

  it("requires persistence before a tonal candidate is considered stable", () => {
    let tracker: ToneTracker = { frequencyHz: 0, confidence: 0, persistence: 0 };
    tracker = updateToneTracker(tracker, { frequencyHz: 1200, confidence: 0.8, scoreDb: 18 });
    expect(tracker.persistence).toBe(1);
    tracker = updateToneTracker(tracker, { frequencyHz: 1210, confidence: 0.85, scoreDb: 19 });
    expect(tracker.persistence).toBe(2);
    expect(tracker.frequencyHz).toBeGreaterThan(1200);
    expect(tracker.frequencyHz).toBeLessThan(1210);
  });

  it("detects an isolated alarm-like spectral peak with useful confidence", () => {
    const frequencies = flatSpectrum(-70);
    const binHz = 48_000 / 2048;
    const targetBin = Math.round(1500 / binHz);
    frequencies[targetBin] = -24;
    frequencies[targetBin - 1] = -28;
    frequencies[targetBin + 1] = -28;
    const candidates = findToneCandidates(frequencies, 48_000, 2048, 3);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].frequencyHz).toBeGreaterThan(1400);
    expect(candidates[0].frequencyHz).toBeLessThan(1600);
    expect(candidates[0].confidence).toBeGreaterThan(0.7);
  });

  it("allows decisive full-strength event controls inside explicit quality bounds", () => {
    const frame = stats({ speechLikelihood: 0, harshConfidence: 1 });
    const profile = computeDynamicProfile({
      harshStrength: 100,
      glassStrength: 100,
      clatterStrength: 100,
      applauseStrength: 100,
      loudnessStrength: 100,
      backgroundStrength: 100,
      stats: frame,
      envelopes: { glass: 1, clatter: 1, applause: 1, loudness: 1 },
      routes: { background: 0, alarm: 0, glass: 1, clatter: 1, applause: 1, harsh: 1, loudness: 1, foregroundDominance: 1 },
      neuralMix: 1,
    });

    expect(profile.highShelfDb).toBeGreaterThanOrEqual(-20);
    expect(profile.transientGain).toBeGreaterThanOrEqual(10 ** (-13 / 20) - 1e-6);
    expect(profile.compressorRatio).toBeLessThanOrEqual(7.5);
    expect(profile.compressorThresholdDb).toBeGreaterThanOrEqual(-24);
    expect(profile.limiterRatio).toBeLessThanOrEqual(21);
    expect(profile.limiterThresholdDb).toBeGreaterThanOrEqual(-4);
    expect(profile.presenceDb).toBeGreaterThanOrEqual(0);
    expect(profile.presenceDb).toBeLessThanOrEqual(2.4);
  });
});