import type { AudioWindow, DetectorInference, InferenceLabel } from "./types";

export const YAMNET_AUDIO_CONTRACT = Object.freeze({
  sampleRateHz: 16_000,
  channels: 1,
  sampleFormat: "float32",
  expectedRange: [-1, 1] as const,
  stftWindowSamples: 400,
  stftHopSamples: 160,
  patchSamples: 15_360,
  patchHopSamples: 7_680,
  outputClasses: 521,
});

export const YAMNET_MODEL_STATUS = Object.freeze({
  model: "YAMNet",
  codeLicense: "Apache-2.0",
  weightLicense: "UNKNOWN",
  weightStatus: "BLOCKED_UNKNOWN",
  weightsBundled: false,
  sourceCommit: "dd3514a41bc2fbafb2d15b58ba36ef20933866d4",
});

export type YamnetScore = { readonly classIndex: number; readonly confidence: number };

const CLASS_GROUPS = [
  { classId: "alarm-siren", label: "alarm-siren", indices: [304, 317, 318, 319, 382, 389, 390, 391, 393, 394] },
  { classId: "dishes-clatter", label: "dishes-clatter", indices: [358, 359, 436, 483] },
  { classId: "applause", label: "applause", indices: [62] },
  { classId: "protected-speech", label: "protected-speech", indices: [0, 1, 2] },
] as const;

const CLASS_BY_INDEX = new Map<number, (typeof CLASS_GROUPS)[number]>();
for (const group of CLASS_GROUPS) for (const index of group.indices) CLASS_BY_INDEX.set(index, group);

/** Map verified YAMNet output indices without claiming that inference ran. */
export function mapYamnetScores(scores: readonly YamnetScore[]): readonly InferenceLabel[] {
  const best = new Map<string, InferenceLabel>();
  for (const score of scores) {
    const group = CLASS_BY_INDEX.get(score.classIndex);
    if (!group || !Number.isInteger(score.classIndex) || !Number.isFinite(score.confidence) || score.confidence < 0 || score.confidence > 1) continue;
    const prior = best.get(group.classId);
    if (!prior || score.confidence > prior.confidence) best.set(group.classId, { label: group.label, confidence: score.confidence });
  }
  return [...best.values()];
}

export class YamnetWeightsBlockedError extends Error {
  readonly code = "YAMNET_WEIGHTS_BLOCKED_UNKNOWN" as const;
  readonly weightStatus = YAMNET_MODEL_STATUS.weightStatus;

  constructor() {
    super("YAMNet inference is unavailable: model weights have BLOCKED_UNKNOWN licensing and are not bundled");
    this.name = "YamnetWeightsBlockedError";
  }
}

/**
 * Fail-closed until a separately reviewed YAMNet artifact is licensed.
 * This adapter deliberately has no network, weight, or synthetic fallback path.
 */
export class YamnetDetectorAdapter implements DetectorInference {
  readonly status = "unavailable" as const;
  async initialize(): Promise<void> { throw new YamnetWeightsBlockedError(); }
  async infer(_window: AudioWindow): Promise<readonly InferenceLabel[]> { throw new YamnetWeightsBlockedError(); }
  dispose(): void {}
}
