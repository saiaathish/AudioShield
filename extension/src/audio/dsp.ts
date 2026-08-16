export interface AttenuationDecision {
  readonly targetGain: number;
  readonly enabled: boolean;
  readonly engine: "separator" | "duck" | "bypass";
}

export interface DspSafetyMetrics {
  nanSamples: number;
  clippedSamples: number;
  alignmentCorrections: number;
}

const safeGain = (gain: number): number => Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 1;
const safeSample = (sample: number): number => Number.isFinite(sample) ? sample : 0;

export const dbToGain = (db: number): number => {
  if (!Number.isFinite(db)) return 1;
  return Math.min(1, Math.max(0, 10 ** (db / 20)));
};

export class RingBuffer {
  private readonly data: Float32Array;
  private read = 0;
  private write = 0;
  private size = 0;
  underruns = 0;
  overruns = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be positive");
    this.data = new Float32Array(capacity);
  }

  get available(): number { return this.size; }
  get capacity(): number { return this.data.length; }

  push(samples: Float32Array): number {
    let accepted = 0;
    for (const sample of samples) {
      if (this.size === this.data.length) { this.overruns++; break; }
      this.data[this.write] = Number.isFinite(sample) ? sample : 0;
      this.write = (this.write + 1) % this.data.length;
      this.size++; accepted++;
    }
    return accepted;
  }

  pop(count: number): Float32Array {
    const result = new Float32Array(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    for (let i = 0; i < result.length; i++) {
      if (!this.size) { this.underruns++; break; }
      result[i] = this.data[this.read];
      this.read = (this.read + 1) % this.data.length;
      this.size--;
    }
    return result;
  }
}

export class SmoothGain {
  private current: number;
  private readonly attackSamples: number;
  private readonly releaseSamples: number;

  constructor(attackSamples: number, releaseSamples: number, initialValue = 1) {
    this.attackSamples = Number.isFinite(attackSamples) ? Math.max(1, attackSamples) : 1;
    this.releaseSamples = Number.isFinite(releaseSamples) ? Math.max(1, releaseSamples) : 1;
    this.current = safeGain(initialValue);
  }

  value(target: number): number {
    const safe = safeGain(target);
    const window = safe < this.current ? this.attackSamples : this.releaseSamples;
    this.current += (safe - this.current) / Math.max(1, window);
    return this.current;
  }
  reset(value = 1): void { this.current = safeGain(value); }
}

export const limit = (sample: number): number => {
  if (!Number.isFinite(sample)) return 0;
  return Math.max(-1, Math.min(1, sample));
};

const isActiveSeparator = (decision: AttenuationDecision, target: Float32Array | undefined): boolean =>
  decision.enabled && decision.engine === "separator" && !!target && target.length > 0;

/**
 * Reconstruct a mixture from an estimated target. A separator decision without
 * target samples is deliberately a finite passthrough; it must never become a
 * hidden whole-mixture duck.
 */
export function recombineSeparated(
  mixture: Float32Array,
  target: Float32Array | undefined,
  decision: AttenuationDecision,
  smoother: SmoothGain,
  metrics?: DspSafetyMetrics,
): Float32Array {
  const output = new Float32Array(mixture.length);
  const activeTarget = isActiveSeparator(decision, target) ? target : undefined;
  if (activeTarget && activeTarget.length !== mixture.length && metrics) {
    metrics.alignmentCorrections += Math.abs(activeTarget.length - mixture.length);
  }

  for (let i = 0; i < mixture.length; i++) {
    const rawMixture = mixture[i];
    const mixtureSample = safeSample(rawMixture);
    if (!Number.isFinite(rawMixture)) metrics && (metrics.nanSamples++);

    if (!activeTarget) {
      smoother.value(1);
      output[i] = limit(mixtureSample);
      continue;
    }

    const rawTarget = i < activeTarget.length ? activeTarget[i] : 0;
    const targetSample = safeSample(rawTarget);
    if (i < activeTarget.length && !Number.isFinite(rawTarget)) metrics && (metrics.nanSamples++);

    // M = residual + target, so residual + attenuatedTarget is M - T + gT.
    const residual = mixtureSample - targetSample;
    const attenuatedTarget = targetSample * smoother.value(decision.targetGain);
    const reconstructed = residual + attenuatedTarget;
    if (!Number.isFinite(reconstructed)) metrics && (metrics.nanSamples++);
    if (Number.isFinite(reconstructed) && Math.abs(reconstructed) > 1) metrics && (metrics.clippedSamples++);
    output[i] = limit(reconstructed);
  }
  return output;
}

/** Blend two aligned frames while preserving the mixture tail on short input. */
export function crossfade(mixture: Float32Array, processed: Float32Array, mix: number): Float32Array {
  const output = new Float32Array(mixture.length);
  const safeMix = safeGain(mix);
  for (let i = 0; i < mixture.length; i++) {
    const original = safeSample(mixture[i]);
    const transformed = i < processed.length ? safeSample(processed[i]) : original;
    output[i] = limit(original + (transformed - original) * safeMix);
  }
  return output;
}

/**
 * DEV_BASELINE_ONLY: attenuates the entire mixture for comparison benchmarks.
 * This is intentionally separate from target reconstruction and is never a
 * selective-separation result.
 */
export function applyGlobalDuck(samples: Float32Array, decision: AttenuationDecision, smoother: SmoothGain, metrics?: DspSafetyMetrics): Float32Array {
  const output = new Float32Array(samples.length);
  const target = decision.enabled && decision.engine === "duck" ? decision.targetGain : 1;
  for (let i = 0; i < samples.length; i++) {
    const rawSample = samples[i];
    if (!Number.isFinite(rawSample)) metrics && (metrics.nanSamples++);
    const rawOutput = safeSample(rawSample) * smoother.value(target);
    if (Number.isFinite(rawOutput) && Math.abs(rawOutput) > 1) metrics && (metrics.clippedSamples++);
    output[i] = limit(rawOutput);
  }
  return output;
}

/** Development benchmark only. Never report this engine as separation. */
export function devDuckDecision(enabled: boolean, attenuationDb: number): AttenuationDecision {
  return { targetGain: enabled ? dbToGain(-Math.abs(attenuationDb)) : 1, enabled, engine: "duck" };
}
