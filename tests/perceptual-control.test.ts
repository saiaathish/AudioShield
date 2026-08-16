import { describe, expect, it } from "vitest";
import {
  computeDynamicProfile,
  computeFrameStats,
  findToneCandidates,
  updateEnvelope,
  updateToneTracker,
  type ToneTracker,
} from "../src/offscreen/perceptual-control";

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

describe("perceptual control v2", () => {
  it("keeps transient rules transparent when no event is present", () => {
    const frequencies = flatSpectrum(-82);
    const waveform = speechLikeWave();
    const stats = computeFrameStats(frequencies, waveform, 48_000, 2048);
    const profile = computeDynamicProfile({
      harshStrength: 0,
      clatterStrength: 100,
      applauseStrength: 100,
      loudnessStrength: 100,
      backgroundStrength: 0,
      stats,
      envelopes: { clatter: 0, applause: 0, loudness: 0 },
      neuralActive: false,
    });

    expect(profile.highShelfDb).toBeCloseTo(0, 6);
    expect(profile.transientGain).toBeCloseTo(1, 6);
    expect(profile.compressorRatio).toBeCloseTo(1.25, 6);
    expect(profile.compressorThresholdDb).toBeCloseTo(-5.5, 6);
  });

  it("makes transient suppression temporary instead of permanent", () => {
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

  it("rejects one-frame tone jumps instead of chasing speech harmonics", () => {
    let tracker: ToneTracker = { frequencyHz: 1100, confidence: 0.8, persistence: 4 };
    tracker = updateToneTracker(tracker, { frequencyHz: 2500, confidence: 0.9, scoreDb: 20 });
    expect(tracker.persistence).toBe(1);
    expect(tracker.frequencyHz).toBe(2500);
  });

  it("detects an isolated alarm-like spectral peak", () => {
    const frequencies = flatSpectrum(-70);
    const binHz = 48_000 / 2048;
    const targetBin = Math.round(1500 / binHz);
    frequencies[targetBin] = -24;
    frequencies[targetBin - 1] = -28;
    frequencies[targetBin + 1] = -28;
    const candidates = findToneCandidates(frequencies, 48_000, 2048, 2);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].frequencyHz).toBeGreaterThan(1400);
    expect(candidates[0].frequencyHz).toBeLessThan(1600);
    expect(candidates[0].confidence).toBeGreaterThan(0.5);
  });

  it("bounds aggressive event controls to quality-safe ranges", () => {
    const stats = computeFrameStats(flatSpectrum(-35), new Float32Array(2048).fill(0.7), 48_000, 2048);
    const profile = computeDynamicProfile({
      harshStrength: 100,
      clatterStrength: 100,
      applauseStrength: 100,
      loudnessStrength: 100,
      backgroundStrength: 100,
      stats,
      envelopes: { clatter: 1, applause: 1, loudness: 1 },
      neuralActive: true,
    });

    expect(profile.highShelfDb).toBeGreaterThanOrEqual(-12.5);
    expect(profile.transientGain).toBeGreaterThanOrEqual(10 ** (-5.5 / 20) - 1e-6);
    expect(profile.compressorRatio).toBeLessThanOrEqual(4.95);
    expect(profile.compressorThresholdDb).toBeGreaterThanOrEqual(-18.1);
    expect(profile.presenceDb).toBeGreaterThanOrEqual(0);
    expect(profile.presenceDb).toBeLessThanOrEqual(1.9);
  });
});
