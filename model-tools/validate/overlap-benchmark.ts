export interface OverlapEvidence {
  readonly fixture: "speech+dishes" | "speech+alarm";
  readonly candidate: "semantic-hearing" | "smaller-alternative";
  readonly status: "not-run";
  readonly reason: string;
  readonly targetAttenuationDb: null;
  readonly speechPreservationDb: null;
  readonly baselineDuckSpeechPreservationDb: null;
  readonly modelSizeBytes: null;
  readonly initMs: null;
  readonly p50InferenceMs: null;
  readonly p95InferenceMs: null;
}

/** Machine-readable hook. It refuses to manufacture metrics from a duck path. */
export function createUnrunEvidence(fixture: OverlapEvidence["fixture"]): OverlapEvidence {
  return {
    fixture,
    candidate: "semantic-hearing",
    status: "not-run",
    reason: "No browser-compatible checkpoint/export/runtime is present in this scaffold.",
    targetAttenuationDb: null,
    speechPreservationDb: null,
    baselineDuckSpeechPreservationDb: null,
    modelSizeBytes: null,
    initMs: null,
    p50InferenceMs: null,
    p95InferenceMs: null,
  };
}
