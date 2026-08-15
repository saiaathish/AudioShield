import type { AudioFrame } from "../../shared/audio/types";
import type { SeparatorEngine, SeparatorRequest, SeparatorResult } from "./types";

/** Safe fail-closed engine until a tested target-conditioned model is bundled. */
export class UnavailableSeparator implements SeparatorEngine {
  readonly backend = "unavailable" as const;

  async initialize(): Promise<void> {
    // No model is silently fetched or substituted.
  }

  async process({ frame }: SeparatorRequest): Promise<SeparatorResult> {
    return {
      frame: cloneFrame(frame),
      backend: this.backend,
      targetAttenuationDb: 0,
      speechPreservationDb: 0,
      latencyMs: 0,
    };
  }

  async dispose(): Promise<void> {}
}

function cloneFrame(frame: AudioFrame): AudioFrame {
  return { ...frame, samples: new Float32Array(frame.samples) };
}
