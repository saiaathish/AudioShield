import {
  SEMANTIC_HEARING_LABELS,
  SEMANTIC_HEARING_MODEL_CONTRACT,
  SEMANTIC_HEARING_SOURCE,
  createLabelVector,
  targetCompatibility,
} from "../separator/semantic-hearing/contract";
import { describe, expect, it } from "vitest";

describe("Semantic Hearing separator lane contract", () => {
  it("pins the intake source and fail-closed checkpoint status", () => {
    expect(SEMANTIC_HEARING_SOURCE.exactHeadSha).toBe("07e9786c7a741f0a7c722dcde66a2679ca068c50");
    expect(SEMANTIC_HEARING_SOURCE.repositoryLicense).toBe("MIT");
    expect(SEMANTIC_HEARING_SOURCE.checkpointLicenseStatus).toBe("BLOCKED_UNKNOWN");
  });

  it("preserves the checked-in stereo model contract", () => {
    expect(SEMANTIC_HEARING_MODEL_CONTRACT).toMatchObject({
      sampleRateHz: 44_100,
      channels: 2,
      labelCount: 20,
      latentStrideSamples: 32,
      modelDim: 256,
      encoderLayers: 10,
      decoderContextFrames: 13,
    });
    expect(SEMANTIC_HEARING_LABELS).toHaveLength(20);
  });

  it("allows only the source vocabulary and refuses dishes/clatter remapping", () => {
    expect(targetCompatibility("speech")).toEqual({ status: "SUPPORTED", sourceLabel: "speech" });
    expect(targetCompatibility("dishes").status).toBe("UNSUPPORTED");
    expect(targetCompatibility("clatter").status).toBe("UNSUPPORTED");
    expect(createLabelVector("speech")[17]).toBe(1);
    expect(() => createLabelVector("dishes")).toThrow("Unsupported Semantic Hearing source label");
  });
});
