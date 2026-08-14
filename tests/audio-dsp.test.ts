import { describe, expect, it } from "vitest";
import { RingBuffer, SmoothGain, applyGain, dbToGain, devDuckDecision } from "../extension/src/audio/dsp";

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
  it("limits stress fixture and keeps dev duck explicitly benchmark-only", () => {
    const output = applyGain(new Float32Array([Infinity, -Infinity, 4, -4]), devDuckDecision(true, 12), new SmoothGain(1, 1));
    expect([...output].every(Number.isFinite)).toBe(true); expect([...output].every((sample) => Math.abs(sample) <= 1)).toBe(true);
    expect(devDuckDecision(true, 8).engine).toBe("duck");
  });
});
