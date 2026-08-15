import { AttenuationDecision, SmoothGain, applyGain } from "./dsp";

export interface AudioWorkletMetrics { processedFrames: number; clippedSamples: number; underruns: number; }

export class StableAudioProcessor {
  readonly metrics: AudioWorkletMetrics = { processedFrames: 0, clippedSamples: 0, underruns: 0 };
  private readonly smoother: SmoothGain;
  constructor(sampleRate: number, attackMs = 8, releaseMs = 40) {
    this.smoother = new SmoothGain(Math.max(1, sampleRate * attackMs / 1000), Math.max(1, sampleRate * releaseMs / 1000));
  }
  process(input: Float32Array, decision: AttenuationDecision): Float32Array {
    const output = applyGain(input, decision, this.smoother);
    this.metrics.processedFrames++;
    for (const sample of output) if (Math.abs(sample) >= 1) this.metrics.clippedSamples++;
    return output;
  }
}
