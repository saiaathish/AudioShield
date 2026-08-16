import {
  AttenuationDecision,
  DspSafetyMetrics,
  SmoothGain,
  applyGlobalDuck,
  crossfade,
  recombineSeparated,
} from "./dsp";

export interface AudioWorkletMetrics extends DspSafetyMetrics {
  processedFrames: number;
  underruns: number;
  crossfadedSamples: number;
}

export class StableAudioProcessor {
  readonly metrics: AudioWorkletMetrics = {
    processedFrames: 0,
    clippedSamples: 0,
    underruns: 0,
    nanSamples: 0,
    alignmentCorrections: 0,
    crossfadedSamples: 0,
  };
  private readonly targetGain: SmoothGain;
  private readonly modeCrossfade: SmoothGain;
  private readonly duckGain: SmoothGain;

  constructor(sampleRate: number, attackMs = 8, releaseMs = 40) {
    const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 1;
    const attackSamples = safeSampleRate * attackMs / 1000;
    const releaseSamples = safeSampleRate * releaseMs / 1000;
    this.targetGain = new SmoothGain(attackSamples, releaseSamples);
    this.modeCrossfade = new SmoothGain(attackSamples, releaseSamples, 0);
    this.duckGain = new SmoothGain(attackSamples, releaseSamples);
  }

  process(input: Float32Array, decision: AttenuationDecision, target?: Float32Array): Float32Array {
    // DEV_BASELINE_ONLY. The baseline remains an explicit whole-mixture path.
    if (decision.engine === "duck") {
      const output = applyGlobalDuck(input, decision, this.duckGain, this.metrics);
      this.metrics.processedFrames++;
      return output;
    }

    const hasTarget = decision.enabled && decision.engine === "separator" && !!target && target.length > 0;
    const separated = recombineSeparated(input, target, decision, this.targetGain, this.metrics);
    const mix = this.modeCrossfade.value(hasTarget ? 1 : 0);
    const output = crossfade(input, hasTarget ? separated : input, mix);
    if (mix > 0 && mix < 1) this.metrics.crossfadedSamples += input.length;
    this.metrics.processedFrames++;
    return output;
  }
}
