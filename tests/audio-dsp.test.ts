import { describe, expect, it } from "vitest";
import { RingBuffer, SmoothGain, applyGlobalDuck, dbToGain, devDuckDecision, recombineSeparated } from "../extension/src/audio/dsp";
import { StableAudioProcessor } from "../extension/src/audio/worklet";

describe("audio DSP safety", () => {
  it("converts invalid or excessive dB to finite safe gain", () => {
    expect(dbToGain(Number.NaN)).toBe(1); expect(dbToGain(12)).toBe(1); expect(dbToGain(-120)).toBeGreaterThanOrEqual(0);
  });
  it("tracks ring buffer underruns and overruns", () => {
    const ring = new RingBuffer(2); expect(ring.push(new Float32Array([1, 2, 3]))).toBe(2); expect(ring.overruns).toBe(1);
    expect(ring.pop(3)).toEqual(new Float32Array([1, 2, 0])); expect(ring.underruns).toBe(1);
  });
  it("reconstructs residual plus attenuated target instead of ducking the mixture", () => {
    const mixture = new Float32Array([0.8]);
    const target = new Float32Array([0.6]);
    const output = recombineSeparated(mixture, target, { targetGain: 0.25, enabled: true, engine: "separator" }, new SmoothGain(1, 1));
    // residual = .8 - .6 = .2; attenuated target = .6 * .25 = .15.
    expect(output[0]).toBeCloseTo(0.35, 6);
    expect(output[0]).not.toBeCloseTo(0.2, 6);
  });
  it("fails closed to finite passthrough when a separator target is unavailable", () => {
    const input = new Float32Array([0.8, Number.NaN]);
    const processor = new StableAudioProcessor(1000, 1, 1);
    const output = processor.process(input, { targetGain: 0.1, enabled: true, engine: "separator" });
    expect(output[0]).toBeCloseTo(0.8, 6);
    expect(output[1]).toBe(0);
    expect(processor.metrics.nanSamples).toBe(1);
  });
  it("smooths target attenuation and crossfades separator activation", () => {
    const processor = new StableAudioProcessor(1000, 4, 4);
    const input = new Float32Array(16).fill(0.8);
    const target = new Float32Array(16).fill(0.6);
    const output = processor.process(input, { targetGain: 0.1, enabled: true, engine: "separator" }, target);
    const jumps = output.slice(1).map((sample, i) => Math.abs(sample - output[i]));
    expect(output[0]).toBeLessThan(0.8);
    expect(Math.max(...jumps)).toBeLessThan(0.2);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(processor.metrics.crossfadedSamples).toBe(16);
  });
  it("returns cleanly to unity on bypass with bounded sample-to-sample changes", () => {
    const processor = new StableAudioProcessor(1000, 4, 4);
    const input = new Float32Array(64).fill(0.75);
    processor.process(input, { targetGain: 0.05, enabled: true, engine: "separator" }, new Float32Array(64).fill(0.5));
    const output = processor.process(input, { targetGain: 1, enabled: false, engine: "bypass" });
    const jumps = output.slice(1).map((sample, i) => Math.abs(sample - output[i]));
    expect(Math.max(...jumps)).toBeLessThan(0.2);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(output.every((sample) => Math.abs(sample - 0.75) < 1e-6)).toBe(true);
    expect(processor.metrics.processedFrames).toBe(2);
  });
  it("aligns short targets, clips safely, and counts NaN/clip protections", () => {
    const metrics = { nanSamples: 0, clippedSamples: 0, alignmentCorrections: 0 };
    const output = recombineSeparated(
      new Float32Array([Infinity, 4]),
      new Float32Array([Number.NaN]),
      { targetGain: 0.5, enabled: true, engine: "separator" },
      new SmoothGain(1, 1),
      metrics,
    );
    expect([...output].every(Number.isFinite)).toBe(true);
    expect([...output].every((sample) => Math.abs(sample) <= 1)).toBe(true);
    expect(metrics.nanSamples).toBe(2);
    expect(metrics.clippedSamples).toBe(1);
    expect(metrics.alignmentCorrections).toBe(1);
  });
  it("limits stress fixture and keeps dev duck explicitly benchmark-only", () => {
    const output = applyGlobalDuck(new Float32Array([Infinity, -Infinity, 4, -4]), devDuckDecision(true, 12), new SmoothGain(1, 1));
    expect([...output].every(Number.isFinite)).toBe(true); expect([...output].every((sample) => Math.abs(sample) <= 1)).toBe(true);
    const fallback = devDuckDecision(true, 8);
    expect(fallback.engine).toBe("duck");
    expect(fallback.engine).not.toBe("separator");
    expect(fallback.targetGain).toBeLessThan(1);
  });
});
