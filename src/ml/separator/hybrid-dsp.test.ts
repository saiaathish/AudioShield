import { describe, expect, it } from "vitest";
import { HybridDspSeparator } from "./hybrid-dsp";

function projection(samples: Float32Array, hz: number, sampleRate: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const phase = 2 * Math.PI * hz * i / sampleRate;
    re += samples[i] * Math.cos(phase);
    im += samples[i] * Math.sin(phase);
  }
  return Math.hypot(re, im);
}

function speechAlarmFixture(sampleRate: number, length: number, alarmHz: number): Float32Array {
  const input = new Float32Array(length);
  for (let i = 0; i < input.length; i += 1) {
    input[i] = 0.22 * Math.sin(2 * Math.PI * 180 * i / sampleRate) + 0.38 * Math.sin(2 * Math.PI * alarmHz * i / sampleRate);
  }
  return input;
}

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
    const engine = new HybridDspSeparator(); await engine.initialize(); const sampleRate = 16_000;
    const input = speechAlarmFixture(sampleRate, 2048, 1200);
    const result = await engine.process({ frame: { sampleRate, channels: 1, samples: input }, targetClassId: "alarm-siren", attenuationDb: -14 });
    expect(result.targetAttenuationDb).toBeLessThan(-8);
    expect(projection(result.frame.samples, 1200, sampleRate)).toBeLessThan(projection(input, 1200, sampleRate) * .4);
    expect(projection(result.frame.samples, 180, sampleRate)).toBeGreaterThan(projection(input, 180, sampleRate) * .9);
  });

  it("refines off-grid alarm frequencies at browser-like 48 kHz frames", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize(); const sampleRate = 48_000;
    for (const alarmHz of [700, 950, 1200, 1450, 1780]) {
      const input = speechAlarmFixture(sampleRate, 1024, alarmHz);
      const result = await engine.process({ frame: { sampleRate, channels: 1, samples: input }, targetClassId: "alarm-siren", attenuationDb: -14 });
      expect(result.diagnostics?.detected, `${alarmHz} Hz should be detected`).toBe(true);
      expect(Math.abs((result.diagnostics?.dominantFrequencyHz ?? 0) - alarmHz), `${alarmHz} Hz frequency estimate`).toBeLessThanOrEqual(10);
      expect(projection(result.frame.samples, alarmHz, sampleRate), `${alarmHz} Hz should be attenuated`).toBeLessThan(projection(input, alarmHz, sampleRate) * .4);
      expect(projection(result.frame.samples, 180, sampleRate), `speech proxy should survive ${alarmHz} Hz`).toBeGreaterThan(projection(input, 180, sampleRate) * .85);
    }
  });

  it("treats zero requested attenuation as transparent", async () => {
    const engine = new HybridDspSeparator(); await engine.initialize(); const sampleRate = 48_000;
    const input = speechAlarmFixture(sampleRate, 1024, 950);
    const result = await engine.process({ frame: { sampleRate, channels: 1, samples: input }, targetClassId: "alarm-siren", attenuationDb: 0 });
    expect(result.frame.samples).toEqual(input);
    expect(result.targetAttenuationDb).toBe(0);
  });
});
