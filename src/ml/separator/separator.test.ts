import { describe, expect, it } from "vitest";
import { UnavailableSeparator } from "./unavailable";

describe("UnavailableSeparator", () => {
  it("fails closed without changing audio or claiming separation", async () => {
    const engine = new UnavailableSeparator();
    const samples = new Float32Array([0.2, -0.4]);
    const result = await engine.process({
      frame: { sampleRate: 48_000, channels: 1, samples },
      targetClassId: "dishes",
    });

    expect(result.backend).toBe("unavailable");
    expect(result.targetAttenuationDb).toBe(0);
    expect(result.speechPreservationDb).toBe(0);
    expect(result.frame.samples).toEqual(samples);
    expect(result.frame.samples).not.toBe(samples);
  });
});
