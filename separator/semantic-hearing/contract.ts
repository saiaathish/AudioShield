/**
 * Offline-only contract extracted from the intake source.
 *
 * This file deliberately does not import production AudioShield code or a
 * checkpoint. It prevents a browser adapter from silently treating an
 * unsupported trigger label as a trained Semantic Hearing target.
 */

export const SEMANTIC_HEARING_SOURCE = {
  repository: "https://github.com/vb000/SemanticHearing",
  exactHeadSha: "07e9786c7a741f0a7c722dcde66a2679ca068c50",
  repositoryLicense: "MIT",
  checkpoint: "39.pt",
  checkpointLicenseStatus: "BLOCKED_UNKNOWN",
} as const;

export const SEMANTIC_HEARING_MODEL_CONTRACT = {
  sampleRateHz: 44_100,
  channels: 2,
  labelCount: 20,
  latentStrideSamples: 32,
  modelDim: 256,
  encoderLayers: 10,
  decoderLayers: 1,
  decoderContextFrames: 13,
  decoderChunkFrames: 13,
  outputBufferFrames: 4,
  conditioning: "mult",
  lookahead: true,
} as const;

export const SEMANTIC_HEARING_LABELS = [
  "alarm_clock",
  "baby_cry",
  "birds_chirping",
  "cat",
  "car_horn",
  "cock_a_doodle_doo",
  "cricket",
  "computer_typing",
  "dog",
  "glass_breaking",
  "gunshot",
  "hammer",
  "music",
  "ocean",
  "door_knock",
  "singing",
  "siren",
  "speech",
  "thunderstorm",
  "toilet_flush",
] as const;

export type AudioShieldTarget = "speech" | "dishes" | "clatter";

export type TargetCompatibility =
  | { status: "SUPPORTED"; sourceLabel: (typeof SEMANTIC_HEARING_LABELS)[number] }
  | { status: "UNSUPPORTED"; reason: string };

export function targetCompatibility(target: AudioShieldTarget): TargetCompatibility {
  if (target === "speech") {
    return { status: "SUPPORTED", sourceLabel: "speech" };
  }

  return {
    status: "UNSUPPORTED",
    reason: `Semantic Hearing's canonical 20-label vocabulary has no ${target} label; no implicit dishes/clatter mapping is allowed.`,
  };
}

export function createLabelVector(sourceLabel: string): Float32Array {
  const index = SEMANTIC_HEARING_LABELS.indexOf(
    sourceLabel as (typeof SEMANTIC_HEARING_LABELS)[number],
  );
  if (index < 0) {
    throw new Error(`Unsupported Semantic Hearing source label: ${sourceLabel}`);
  }

  const vector = new Float32Array(SEMANTIC_HEARING_LABELS.length);
  vector[index] = 1;
  return vector;
}
