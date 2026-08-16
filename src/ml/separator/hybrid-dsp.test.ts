import { describe, expect, it } from "vitest";
import { HybridDspSeparator } from "./hybrid-dsp";

describe("HybridDspSeparator", () => {
  it("processes dishes copy-safely with honest DSP backend", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize();
    const input = new Float32Array([0, 0.5, -0.5, 0.2]);
    const result = await engine.process({ frame: { sampleRate: 16_000, channels: 1, samples: input }, targetClassId: "dishes" });
    expect(result.backend).toBe("dsp-hybrid"); expect(result.frame.samples).not.toBe(input); expect([...input]).toEqual(Array.from(new Float32Array([0, 0.5, -0.5, 0.2]))); expect(result.targetAttenuationDb).toBe(0); expect(result.speechPreservationDb).toBe(0); expect(result.diagnostics?.metricsAvailable).toBe(false);
    expect([...result.frame.samples].every(Number.isFinite)).toBe(true);
  });
  it("masks deterministic high-band transients while retaining low-band speech", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize(); const input = new Float32Array(128);
    for (let i = 0; i < input.length; i++) input[i] = .2 * Math.sin(2 * Math.PI * 2 * i / 64) + (i % 3 === 0 ? .45 : 0);
    const result = await engine.process({ frame: { sampleRate: 16_000, channels: 1, samples: input }, targetClassId: "dishes" });
    expect(result.frame.samples).not.toEqual(input); expect(result.frame.samples.every(Number.isFinite)).toBe(true);
  });
  it("bypasses unsupported targets and oversized frames as identity copies", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize();
    const input = new Float32Array(16_385).fill(0.2);
    const result = await engine.process({ frame: { sampleRate: 16_000, channels: 1, samples: input }, targetClassId: "speech" });
    expect(result.backend).toBe("dsp-hybrid"); expect(result.frame.samples).not.toBe(input); expect(result.frame.samples).toEqual(input);
  });
  it("requires initialization", async () => {
    await expect(new HybridDspSeparator().process({ frame: { sampleRate: 16_000, channels: 1, samples: new Float32Array(1) }, targetClassId: "dishes" })).rejects.toThrow("initialized");
  });
  it("attenuates dominant tonal alarm energy without global gain reduction", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize(); const sampleRate = 16_000; const input = new Float32Array(2048);
    for (let i = 0; i < input.length; i++) input[i] = .22 * Math.sin(2 * Math.PI * 180 * i / sampleRate) + .38 * Math.sin(2 * Math.PI * 1200 * i / sampleRate);
    const result = await engine.process({ frame: { sampleRate, channels: 1, samples: input }, targetClassId: "alarm-siren" });
    const projection = (samples: Float32Array, hz: number) => { let re = 0; let im = 0; for (let i = 0; i < samples.length; i++) { const phase = 2 * Math.PI * hz * i / sampleRate; re += samples[i] * Math.cos(phase); im += samples[i] * Math.sin(phase); } return Math.hypot(re, im); };
    expect(result.targetAttenuationDb).toBeLessThan(-3); expect(projection(result.frame.samples, 1200)).toBeLessThan(projection(input, 1200) * .8); expect(projection(result.frame.samples, 180)).toBeGreaterThan(projection(input, 180) * .75);
  });
});
