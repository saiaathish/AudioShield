import type { AudioFrame } from "../../shared/audio/types";

export type SeparatorBackend = "onnx-webgpu" | "onnx-wasm" | "dsp-hybrid" | "unavailable";

export interface SeparatorRequest {
  readonly frame: AudioFrame;
  readonly targetClassId: string;
  readonly attenuationDb?: number;
}

export interface SeparatorResult {
  readonly frame: AudioFrame;
  readonly backend: SeparatorBackend;
  readonly targetAttenuationDb: number;
  readonly speechPreservationDb: number;
  readonly latencyMs: number;
  readonly diagnostics?: { readonly metricsAvailable: false; readonly method: "dsp-hybrid"; readonly reason: "no-reference-stems" };
}

export interface SeparatorEngine {
  readonly backend: SeparatorBackend;
  initialize(): Promise<void>;
  process(request: SeparatorRequest): Promise<SeparatorResult>;
  processSync?(request: SeparatorRequest): SeparatorResult;
  dispose(): Promise<void>;
}
