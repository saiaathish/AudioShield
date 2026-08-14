import { describe, expect, it } from "vitest";
import { RingBuffer, SmoothGain, applyGain, dbToGain, devDuckDecision } from "../extension/src/audio/dsp";
import { StableAudioProcessor } from "../extension/src/audio/worklet";

describe("audio DSP safety", () => {
  it("converts invalid or excessive dB to finite safe gain", () => {
    expect(dbToGain(Number.NaN)).toBe(1); expect(dbToGain(12)).toBe(1); expect(dbToGain(-120)).toBeGreaterThanOrEqual(0);
  });
  it("tracks ring buffer underruns and overruns", () => {
    const ring = new RingBuffer(2); expect(ring.push(new Float32Array([1, 2, 3]))).toBe(2); expect(ring.overruns).toBe(1);
    expect(ring.pop(3)).toEqual(new Float32Array([1, 2, 0])); expect(ring.underruns).toBe(1);
  });
  it("smooths category and bypass transitions without discontinuous gain", () => {
    const smoother = new SmoothGain(4, 4); const input = new Float32Array(16).fill(0.8);
    const protectedSamples = applyGain(input, { targetGain: 0.1, enabled: true, engine: "separator" }, smoother);
    const bypassSamples = applyGain(input, { targetGain: 1, enabled: false, engine: "bypass" }, smoother);
    expect(protectedSamples.every(Number.isFinite)).toBe(true); expect(bypassSamples[0]).toBeLessThan(0.8); expect(bypassSamples[15]).toBeLessThanOrEqual(0.8);
  });
  it("returns cleanly to unity on bypass with bounded sample-to-sample changes", () => {
    const processor = new StableAudioProcessor(1000, 4, 4);
    const input = new Float32Array(64).fill(0.75);
    processor.process(input, { targetGain: 0.05, enabled: true, engine: "separator" });
    const output = processor.process(input, { targetGain: 1, enabled: false, engine: "bypass" });
    const jumps = output.slice(1).map((sample, i) => Math.abs(sample - output[i]));
    expect(Math.max(...jumps)).toBeLessThan(0.2);
    expect(output[output.length - 1]).toBeGreaterThan(output[0]);
    expect(processor.metrics.processedFrames).toBe(2);
  });
  it("limits stress fixture and keeps dev duck explicitly benchmark-only", () => {
    const output = applyGain(new Float32Array([Infinity, -Infinity, 4, -4]), devDuckDecision(true, 12), new SmoothGain(1, 1));
    expect([...output].every(Number.isFinite)).toBe(true); expect([...output].every((sample) => Math.abs(sample) <= 1)).toBe(true);
    const fallback = devDuckDecision(true, 8);
    expect(fallback.engine).toBe("duck");
    expect(fallback.engine).not.toBe("separator");
    expect(fallback.targetGain).toBeLessThan(1);
  });
});
