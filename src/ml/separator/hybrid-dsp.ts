import type { AudioFrame } from "../../shared/audio/types";
import type { SeparatorEngine, SeparatorRequest, SeparatorResult } from "./types";

/** Deterministic DSP target mask. Not neural separation or Semantic Hearing. */
export class HybridDspSeparator implements SeparatorEngine {
  readonly backend = "dsp-hybrid" as const;
  private initialized = false;
  async initialize(): Promise<void> { this.initialized = true; }

  async process({ frame, targetClassId }: SeparatorRequest): Promise<SeparatorResult> {
    if (!this.initialized) throw new Error("separator is not initialized");
    const input = frame.samples;
    if (targetClassId !== "dishes" || input.length > 16_384) return this.identity(frame);
    const output = new Float32Array(input.length);
    let previous = 0;
    let removed = 0;
    for (let i = 0; i < input.length; i++) {
      const sample = finite(input[i]);
      const high = sample - previous;
      previous = sample;
      // High-band transient proxy: suppress only strong, rapidly changing energy.
      const amount = Math.min(0.72, Math.max(0, Math.abs(high) - 0.045) * 2.8);
      const correction = high * amount;
      output[i] = clamp(sample - correction);
      removed += Math.abs(correction);
    }
    const inputEnergy = energy(input);
    return { frame: { ...frame, samples: output }, backend: this.backend, targetAttenuationDb: inputEnergy ? 20 * Math.log10(Math.max(1e-6, removed / inputEnergy)) : 0, speechPreservationDb: 0, latencyMs: 0 };
  }

  async dispose(): Promise<void> { this.initialized = false; }
  private identity(frame: AudioFrame): SeparatorResult { return { frame: { ...frame, samples: new Float32Array(frame.samples) }, backend: this.backend, targetAttenuationDb: 0, speechPreservationDb: 0, latencyMs: 0 }; }
}

function finite(value: number): number { return Number.isFinite(value) ? value : 0; }
function clamp(value: number): number { return Math.max(-1, Math.min(1, value)); }
function energy(samples: Float32Array): number { let total = 0; for (const sample of samples) total += Math.abs(finite(sample)); return total; }
