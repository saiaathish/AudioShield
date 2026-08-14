export interface AttenuationDecision {
  readonly targetGain: number;
  readonly enabled: boolean;
  readonly engine: "separator" | "duck" | "bypass";
}

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
    const result = new Float32Array(Math.max(0, count));
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
  private current = 1;
  constructor(private readonly attackSamples: number, private readonly releaseSamples: number) {}
  value(target: number): number {
    const safe = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : 1;
    const window = safe < this.current ? this.attackSamples : this.releaseSamples;
    this.current += (safe - this.current) / Math.max(1, window);
    return this.current;
  }
  reset(value = 1): void { this.current = Math.min(1, Math.max(0, value)); }
}

export const limit = (sample: number): number => {
  if (!Number.isFinite(sample)) return 0;
  return Math.max(-1, Math.min(1, sample));
};

export function applyGain(samples: Float32Array, decision: AttenuationDecision, smoother: SmoothGain): Float32Array {
  const output = new Float32Array(samples.length);
  const target = decision.enabled && decision.engine !== "bypass" ? decision.targetGain : 1;
  for (let i = 0; i < samples.length; i++) output[i] = limit(samples[i] * smoother.value(target));
  return output;
}

/** Development benchmark only. Never report this engine as separation. */
export function devDuckDecision(enabled: boolean, attenuationDb: number): AttenuationDecision {
  return { targetGain: enabled ? dbToGain(-Math.abs(attenuationDb)) : 1, enabled, engine: "duck" };
}
