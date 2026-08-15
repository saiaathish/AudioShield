import { describe, expect, it } from "vitest";
import { HybridDspSeparator } from "./hybrid-dsp";

describe("HybridDspSeparator", () => {
  it("processes dishes copy-safely with honest DSP backend", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize();
    const input = new Float32Array([0, 0.5, -0.5, 0.2]);
    const result = await engine.process({ frame: { sampleRate: 16_000, channels: 1, samples: input }, targetClassId: "dishes" });
    expect(result.backend).toBe("dsp-hybrid"); expect(result.frame.samples).not.toBe(input); expect([...input]).toEqual(Array.from(new Float32Array([0, 0.5, -0.5, 0.2])));
    expect([...result.frame.samples].every(Number.isFinite)).toBe(true);
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
});
