import type { AudioFrame } from "../../shared/audio/types";
import type { SeparatorEngine, SeparatorRequest, SeparatorResult } from "./types";

/** Bounded deterministic DFT mask. Not neural separation or Semantic Hearing. */
export class HybridDspSeparator implements SeparatorEngine {
  readonly backend = "dsp-hybrid" as const;
  private initialized = false;
  async initialize(): Promise<void> { this.initialized = true; }

  async process({ frame, targetClassId }: SeparatorRequest): Promise<SeparatorResult> {
    if (!this.initialized) throw new Error("separator is not initialized");
    const identity = targetClassId !== "dishes" || frame.samples.length > 16_384;
    const samples = identity ? new Float32Array(frame.samples) : mask(frame.samples);
    return { frame: { ...frame, samples }, backend: this.backend, targetAttenuationDb: 0, speechPreservationDb: 0, latencyMs: 0, diagnostics: { metricsAvailable: false, method: "dsp-hybrid", reason: "no-reference-stems" } };
  }
  async dispose(): Promise<void> { this.initialized = false; }
}

// Same high-band transient rule as model-tools/validate/hybrid-benchmark.mjs,
// reduced to 64-point frames to keep production cost bounded.
function mask(input: Float32Array): Float32Array {
  const output = new Float32Array(input); const frame = 64; const bins = frame / 2;
  for (let start = 0; start + frame <= input.length; start += frame) {
    const re = new Float64Array(bins), im = new Float64Array(bins); let high = 0, low = 0;
    for (let k = 0; k < bins; k++) { for (let j = 0; j < frame; j++) { const phase = 2 * Math.PI * k * j / frame; re[k] += input[start + j] * Math.cos(phase); im[k] -= input[start + j] * Math.sin(phase); } const e = re[k] ** 2 + im[k] ** 2; if (k >= 8) high += e; else low += e; }
    if (high <= low * .11) continue;
    for (let j = 0; j < frame; j++) { let correction = 0; for (let k = 8; k < bins; k++) correction += (re[k] * Math.cos(2 * Math.PI * k * j / frame) - im[k] * Math.sin(2 * Math.PI * k * j / frame)) * .82 / bins; output[start + j] = clamp(output[start + j] - correction * .72); }
  }
  return output;
}
function clamp(value: number): number { return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0)); }
