import type { AudioFrame } from "../../shared/audio/types";
import type { SeparatorEngine, SeparatorRequest, SeparatorResult } from "./types";

/** Bounded deterministic DFT mask. Not neural separation or Semantic Hearing. */
export class HybridDspSeparator implements SeparatorEngine {
  readonly backend = "dsp-hybrid" as const;
  private initialized = false;
  async initialize(): Promise<void> { this.initialized = true; }

  async process({ frame, targetClassId }: SeparatorRequest): Promise<SeparatorResult> {
    return this.processSync({ frame, targetClassId });
  }
  processSync({ frame, targetClassId, attenuationDb }: SeparatorRequest): SeparatorResult {
    if (!this.initialized) throw new Error("separator is not initialized");
    const result = targetClassId === "alarm-siren" ? attenuateTonalAlarm(frame.samples, frame.sampleRate, attenuationDb) :
      targetClassId === "dishes" && frame.samples.length <= 16_384 ? { samples: mask(frame.samples), attenuationDb: 0 } :
      { samples: new Float32Array(frame.samples), attenuationDb: 0 };
    return { frame: { ...frame, samples: result.samples }, backend: this.backend, targetAttenuationDb: result.attenuationDb, speechPreservationDb: 0, latencyMs: 0, diagnostics: { metricsAvailable: false, method: "dsp-hybrid", reason: "no-reference-stems" } };
  }
  async dispose(): Promise<void> { this.initialized = false; }
}

type AlarmResult = { samples: Float32Array; attenuationDb: number };

/** Deterministic narrow P0 rescue: detect concentrated tonal energy, then subtract
 * only the estimated dominant sinusoid. No model, filename, timestamp, or network. */
function attenuateTonalAlarm(input: Float32Array, sampleRate: number, requestedDb = -12): AlarmResult {
  const output = new Float32Array(input);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return { samples: output, attenuationDb: 0 };
  if (input.length < 128) return { samples: mask(input), attenuationDb: 0 };
  const frequencies: number[] = [];
  for (let hz = 500; hz <= Math.min(5000, sampleRate / 2 - 100); hz += 100) frequencies.push(hz);
  let total = 0; for (const sample of input) total += sample * sample;
  const rmsPower = total / input.length;
  if (rmsPower < 1e-7) return { samples: output, attenuationDb: 0 };
  let bestFrequency = 0; let bestPower = 0; let bestRe = 0; let bestIm = 0;
  for (const frequency of frequencies) {
    let re = 0; let im = 0;
    for (let i = 0; i < input.length; i++) { const phase = 2 * Math.PI * frequency * i / sampleRate; re += input[i] * Math.cos(phase); im -= input[i] * Math.sin(phase); }
    const power = 2 * (re * re + im * im) / (input.length * input.length);
    if (power > bestPower) { bestPower = power; bestFrequency = frequency; bestRe = re; bestIm = im; }
  }
  const concentration = bestPower / Math.max(rmsPower, 1e-9);
  const confidence = Math.max(0, Math.min(1, (concentration - 0.14) / 0.45));
  if (confidence < 0.55 || bestFrequency === 0) return { samples: output, attenuationDb: 0 };
  const requested = Math.max(0, Math.min(18, Math.abs(Number.isFinite(requestedDb) ? requestedDb : 12)));
  const removal = Math.min(0.92, (1 - 10 ** (-requested / 20)) * confidence);
  for (let i = 0; i < output.length; i++) {
    const angle = 2 * Math.PI * bestFrequency * i / sampleRate;
    const tone = 2 * (bestRe * Math.cos(angle) - bestIm * Math.sin(angle)) / input.length;
    output[i] = clamp(output[i] - removal * tone);
  }
  const attenuationDb = 20 * Math.log10(Math.max(1e-6, 1 - removal));
  return { samples: output, attenuationDb };
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
