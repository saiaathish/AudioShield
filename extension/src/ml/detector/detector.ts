import { normalizeLabel } from "./labels";
import type { AudioWindow, DetectorInference, DetectorMetrics, SoundDetection, SoundDetector, P0SoundId } from "./types";

type State = { candidateStartedAtMs: number; startedAtMs?: number; confidence: number; on: number; off: number };
export interface DetectorOptions { readonly threshold?: number; readonly onWindows?: number; readonly offWindows?: number; readonly clock?: () => number; }

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export class LocalSoundDetector implements SoundDetector {
  private readonly states = new Map<P0SoundId, State>();
  private initialized = false;
  private loadMs = 0;
  private inferenceMs = 0;
  private readonly inferenceLatenciesMs: number[] = [];
  private windowCount = 0;
  private readonly threshold: number;
  private readonly onWindows: number;
  private readonly offWindows: number;
  private readonly clock: () => number;
  constructor(private readonly inference: DetectorInference, options: DetectorOptions = {}) {
    this.threshold = options.threshold ?? 0.6;
    this.onWindows = options.onWindows ?? 2;
    this.offWindows = options.offWindows ?? 2;
    this.clock = options.clock ?? (() => performance.now());
    if (!Number.isFinite(this.threshold) || this.threshold < 0 || this.threshold > 1) throw new RangeError("detector threshold must be between 0 and 1");
    if (!Number.isInteger(this.onWindows) || this.onWindows < 1) throw new RangeError("detector onWindows must be a positive integer");
    if (!Number.isInteger(this.offWindows) || this.offWindows < 1) throw new RangeError("detector offWindows must be a positive integer");
  }
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const start = this.clock();
    try {
      await this.inference.initialize?.();
      this.initialized = true;
    } finally {
      this.loadMs = Math.max(0, this.clock() - start);
    }
  }
  async process(window: AudioWindow): Promise<readonly SoundDetection[]> {
    if (!this.initialized) throw new Error("detector is not initialized");
    const start = this.clock();
    const raw = await this.inference.infer(window);
    const latency = Math.max(0, this.clock() - start);
    this.inferenceMs += latency;
    this.inferenceLatenciesMs.push(latency);
    this.windowCount++;
    const best = new Map<P0SoundId, { label: string; confidence: number }>();
    for (const item of raw) {
      const mapped = normalizeLabel(item.label);
      if (mapped && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1) {
        const prior = best.get(mapped.classId);
        if (!prior || item.confidence > prior.confidence) best.set(mapped.classId, { label: mapped.label, confidence: item.confidence });
      }
    }
    const events: SoundDetection[] = [];
    for (const [id, state] of this.states) {
      const hit = best.get(id);
      if (hit && hit.confidence >= this.threshold) {
        state.on++;
        state.off = 0;
        state.confidence = hit.confidence;
        if (state.startedAtMs === undefined && state.on >= this.onWindows) state.startedAtMs = state.candidateStartedAtMs;
      } else {
        state.off++;
        state.on = 0;
        if (state.off >= this.offWindows) {
          if (state.startedAtMs !== undefined) {
            events.push({ classId: id, label: id, confidence: state.confidence, startedAtMs: state.startedAtMs, endedAtMs: window.timestampMs });
          }
          this.states.delete(id);
        }
      }
    }
    for (const [id, hit] of best) {
      if (!this.states.has(id) && hit.confidence >= this.threshold) {
        this.states.set(id, { candidateStartedAtMs: window.timestampMs, confidence: hit.confidence, on: 1, off: 0 });
      }
    }
    return events;
  }
  metrics(): DetectorMetrics {
    return {
      modelLoadMs: this.loadMs,
      inferenceLatencyMs: this.windowCount ? this.inferenceMs / this.windowCount : 0,
      p50InferenceLatencyMs: percentile(this.inferenceLatenciesMs, 0.5),
      p95InferenceLatencyMs: percentile(this.inferenceLatenciesMs, 0.95),
      windows: this.windowCount,
    };
  }
  async dispose(): Promise<void> { await this.inference.dispose?.(); this.states.clear(); this.initialized = false; }
}
