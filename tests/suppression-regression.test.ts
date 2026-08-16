import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeDynamicProfile,
  computeSensoryRoutes,
  continuousNeuralMix,
  perceptualDrive,
  strengthToUnit,
  type FrameStats,
  type ToneTracker,
} from "../src/offscreen/perceptual-control";
import {
  alarmAttenuationDb,
  alarmNotchQ,
  alarmStemMix,
  alarmStrengthDrive,
  stemRouteMix,
} from "../src/offscreen/sensory-engine";

const frame = (overrides: Partial<FrameStats> = {}): FrameStats => ({
  peak: 0.55,
  rms: 0.12,
  crest: 4.6,
  highRatio: 0.48,
  ultraHighRatio: 0.28,
  spectralFlatness: 0.34,
  spectralFlux: 0.42,
  spectralCentroidHz: 3600,
  speechLikelihood: 0.08,
  backgroundConfidence: 0.25,
  glassConfidence: 0.82,
  clatterConfidence: 0.55,
  applauseConfidence: 0.35,
  harshConfidence: 0.52,
  loudnessConfidence: 0.45,
  ...overrides,
});

function profile(strength: number) {
  const stats = frame();
  const routes = computeSensoryRoutes(stats, []);
  return computeDynamicProfile({
    harshStrength: strength,
    glassStrength: strength,
    clatterStrength: strength,
    applauseStrength: strength,
    loudnessStrength: strength,
    backgroundStrength: strength,
    stats,
    envelopes: { glass: 0.82, clatter: 0.55, applause: 0.35, loudness: 0.45 },
    routes,
    neuralMix: continuousNeuralMix(strength, 0.8),
  });
}

describe("suppression regression guard", () => {
  it("keeps every 1% control step active while preserving decisive bounded suppression", () => {
    let previousDrive = -1;
    let previousNeuralMix = -1;
    for (let value = 0; value <= 100; value += 1) {
      expect(strengthToUnit(value)).toBeGreaterThan(previousDrive < 0 ? -1 : strengthToUnit(value - 1));
      const drive = perceptualDrive(value);
      const neuralMix = continuousNeuralMix(value, 0.8);
      expect(drive).toBeGreaterThan(previousDrive);
      expect(neuralMix).toBeGreaterThan(previousNeuralMix);
      previousDrive = drive;
      previousNeuralMix = neuralMix;
    }

    const p0 = profile(0);
    const p25 = profile(25);
    const p50 = profile(50);
    const p75 = profile(75);
    const p100 = profile(100);

    expect(p0.highShelfDb).toBeCloseTo(0, 8);
    expect(p0.transientGain).toBeCloseTo(1, 8);
    expect(p25.highShelfDb).toBeLessThan(0);
    expect(p50.highShelfDb).toBeLessThanOrEqual(p25.highShelfDb);
    expect(p75.highShelfDb).toBeLessThanOrEqual(p50.highShelfDb);
    expect(p100.highShelfDb).toBeLessThanOrEqual(p75.highShelfDb);
    expect(p100.highShelfDb).toBeLessThanOrEqual(-6);
    expect(p100.highShelfDb).toBeGreaterThanOrEqual(-20);
    expect(p100.transientGain).toBeLessThan(0.75);
    expect(p100.compressorRatio).toBeGreaterThan(2);
  });

  it("maps alarm protection from transparent zero to emergency-grade maximum", () => {
    expect(alarmStrengthDrive(0)).toBe(0);
    expect(alarmStrengthDrive(100)).toBe(1);
    expect(alarmAttenuationDb(0, 0.9, 0.1)).toBe(0);

    let previousDrive = alarmStrengthDrive(0);
    let previousCut = alarmAttenuationDb(0, 0.9, 0.1);
    for (let value = 1; value <= 100; value += 1) {
      const drive = alarmStrengthDrive(value);
      const cut = alarmAttenuationDb(value, 0.9, 0.1);
      expect(drive).toBeGreaterThan(previousDrive);
      expect(cut).toBeLessThan(previousCut);
      previousDrive = drive;
      previousCut = cut;
    }

    const cut25 = alarmAttenuationDb(25, 0.9, 0.1);
    const cut50 = alarmAttenuationDb(50, 0.9, 0.1);
    const cut75 = alarmAttenuationDb(75, 0.9, 0.1);
    const cut100 = alarmAttenuationDb(100, 0.9, 0.1);

    expect(cut25).toBeGreaterThan(-15);
    expect(cut50).toBeLessThan(-20);
    expect(cut75).toBeLessThan(-35);
    expect(cut100).toBeLessThan(-55);
    expect(alarmNotchQ(100, 0.9)).toBeLessThan(alarmNotchQ(25, 0.9));
  });

  it("uses event routes to remix toward the neural foreground stem", () => {
    expect(stemRouteMix(0, 1, 1.2)).toBe(0);
    expect(stemRouteMix(100, 1, 1.2)).toBe(1);
    expect(alarmStemMix(0, 1)).toBe(0);
    expect(alarmStemMix(100, 1)).toBe(1);

    let previousAlarmMix = -1;
    for (let value = 0; value <= 100; value += 1) {
      const mix = alarmStemMix(value, 0.95);
      expect(mix).toBeGreaterThan(previousAlarmMix);
      previousAlarmMix = mix;
    }

    expect(alarmStemMix(25, 0.95)).toBeGreaterThan(0.15);
    expect(alarmStemMix(50, 0.95)).toBeGreaterThan(0.40);
    expect(alarmStemMix(75, 0.95)).toBeGreaterThan(0.70);
    expect(alarmStemMix(100, 0.95)).toBeGreaterThan(0.99);
    expect(stemRouteMix(100, 0.95, 1.2)).toBeGreaterThan(0.99);
  });

  it("keeps persistent alarm tones dominant over generic background routing", () => {
    const stats = frame({ backgroundConfidence: 0.92, glassConfidence: 0, clatterConfidence: 0, applauseConfidence: 0, loudnessConfidence: 0 });
    const tones: ToneTracker[] = [
      { frequencyHz: 2800, confidence: 0.94, persistence: 7 },
      { frequencyHz: 3350, confidence: 0.82, persistence: 6 },
    ];
    const routes = computeSensoryRoutes(stats, tones);
    expect(routes.alarm).toBeGreaterThan(0.85);
    expect(routes.background).toBeLessThan(0.2);
  });

  it("locks the last real-Chrome suppression cadence until a replacement is listening-tested", () => {
    const source = fs.readFileSync("src/offscreen/sensory-engine.ts", "utf8");
    expect(source).toContain("analyser.fftSize = 2048");
    expect(source).toContain("setInterval(analyze, 70)");
    expect(source).not.toContain("eventLookahead");
  });
});