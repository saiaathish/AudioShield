import type { AudioFrame } from "../../shared/audio/types";
import type { SeparatorEngine, SeparatorRequest, SeparatorResult } from "./types";

/** Bounded deterministic DSP. Not neural separation or Semantic Hearing. */
export class HybridDspSeparator implements SeparatorEngine {
  readonly backend = "dsp-hybrid" as const;
  private initialized = false;

  async initialize(): Promise<void> { this.initialized = true; }

  async process({ frame, targetClassId, attenuationDb }: SeparatorRequest): Promise<SeparatorResult> {
    return this.processSync({ frame, targetClassId, attenuationDb });
  }

  processSync({ frame, targetClassId, attenuationDb }: SeparatorRequest): SeparatorResult {
    if (!this.initialized) throw new Error("separator is not initialized");
    const startedAt = nowMs();

    if (targetClassId === "alarm-siren") {
      const result = attenuateTonalAlarm(frame.samples, frame.sampleRate, attenuationDb);
      return {
        frame: { ...frame, samples: result.samples },
        backend: this.backend,
        targetAttenuationDb: result.attenuationDb,
        speechPreservationDb: 0,
        latencyMs: Math.max(0, nowMs() - startedAt),
        diagnostics: {
          metricsAvailable: false,
          method: "dsp-hybrid",
          reason: "no-reference-stems",
          detected: result.detected,
          confidence: result.confidence,
          dominantFrequencyHz: result.dominantFrequencyHz,
        },
      };
    }

    const samples = targetClassId === "dishes" && frame.samples.length <= 16_384
      ? mask(frame.samples)
      : new Float32Array(frame.samples);
    return {
      frame: { ...frame, samples },
      backend: this.backend,
      targetAttenuationDb: 0,
      speechPreservationDb: 0,
      latencyMs: Math.max(0, nowMs() - startedAt),
      diagnostics: { metricsAvailable: false, method: "dsp-hybrid", reason: "no-reference-stems" },
    };
  }

  async dispose(): Promise<void> { this.initialized = false; }
}

type AlarmResult = {
  samples: Float32Array;
  attenuationDb: number;
  confidence: number;
  dominantFrequencyHz: number;
  detected: boolean;
};

/** Deterministic tonal P0: find concentrated alarm/siren energy and subtract only
 * the estimated dominant sinusoid. It never keys off URLs, filenames or timestamps. */
function attenuateTonalAlarm(input: Float32Array, sampleRate: number, requestedDb = -12): AlarmResult {
  const output = new Float32Array(input);
  const identity = (confidence = 0, dominantFrequencyHz = 0): AlarmResult => ({
    samples: output,
    attenuationDb: 0,
    confidence,
    dominantFrequencyHz,
    detected: false,
  });

  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || input.length < 128) return identity();

  let total = 0;
  for (const sample of input) total += sample * sample;
  const rmsPower = total / input.length;
  if (rmsPower < 1e-7) return identity();

  const upperHz = Math.min(5000, sampleRate / 2 - 100);
  let bestFrequency = 0;
  let bestPower = 0;
  let bestRe = 0;
  let bestIm = 0;

  for (let frequency = 500; frequency <= upperHz; frequency += 100) {
    let re = 0;
    let im = 0;
    const omega = 2 * Math.PI * frequency / sampleRate;
    for (let i = 0; i < input.length; i += 1) {
      const phase = omega * i;
      re += input[i] * Math.cos(phase);
      im -= input[i] * Math.sin(phase);
    }
    const power = 2 * (re * re + im * im) / (input.length * input.length);
    if (power > bestPower) {
      bestPower = power;
      bestFrequency = frequency;
      bestRe = re;
      bestIm = im;
    }
  }

  if (bestFrequency === 0) return identity();

  const concentration = bestPower / Math.max(rmsPower, 1e-9);
  const confidence = Math.max(0, Math.min(1, (concentration - 0.14) / 0.45));
  if (confidence < 0.55) return identity(confidence, bestFrequency);

  const requested = Math.max(0, Math.min(18, Math.abs(Number.isFinite(requestedDb) ? requestedDb : 12)));
  const removal = Math.min(0.92, (1 - 10 ** (-requested / 20)) * confidence);
  const omega = 2 * Math.PI * bestFrequency / sampleRate;
  for (let i = 0; i < output.length; i += 1) {
    const angle = omega * i;
    const tone = 2 * (bestRe * Math.cos(angle) - bestIm * Math.sin(angle)) / input.length;
    output[i] = clamp(output[i] - removal * tone);
  }

  return {
    samples: output,
    attenuationDb: 20 * Math.log10(Math.max(1e-6, 1 - removal)),
    confidence,
    dominantFrequencyHz: bestFrequency,
    detected: true,
  };
}

// Retained as a benchmark/reference path; the release UI currently exposes alarm/siren only.
function mask(input: Float32Array): Float32Array {
  const output = new Float32Array(input);
  const frame = 64;
  const bins = frame / 2;
  for (let start = 0; start + frame <= input.length; start += frame) {
    const re = new Float64Array(bins);
    const im = new Float64Array(bins);
    let high = 0;
    let low = 0;
    for (let k = 0; k < bins; k += 1) {
      for (let j = 0; j < frame; j += 1) {
        const phase = 2 * Math.PI * k * j / frame;
        re[k] += input[start + j] * Math.cos(phase);
        im[k] -= input[start + j] * Math.sin(phase);
      }
      const energy = re[k] ** 2 + im[k] ** 2;
      if (k >= 8) high += energy;
      else low += energy;
    }
    if (high <= low * 0.11) continue;
    for (let j = 0; j < frame; j += 1) {
      let correction = 0;
      for (let k = 8; k < bins; k += 1) {
        correction += (re[k] * Math.cos(2 * Math.PI * k * j / frame) - im[k] * Math.sin(2 * Math.PI * k * j / frame)) * 0.82 / bins;
      }
      output[start + j] = clamp(output[start + j] - correction * 0.72);
    }
  }
  return output;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}
