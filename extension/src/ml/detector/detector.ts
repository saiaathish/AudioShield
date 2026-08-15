import { normalizeLabel } from "./labels";
import type { AudioWindow, DetectorInference, DetectorMetrics, SoundDetection, SoundDetector, P0SoundId } from "./types";

type State = { startedAtMs: number; confidence: number; on: number; off: number };
export interface DetectorOptions { readonly threshold?: number; readonly onWindows?: number; readonly offWindows?: number; readonly clock?: () => number; }

export class LocalSoundDetector implements SoundDetector {
  private readonly states = new Map<P0SoundId, State>();
  private initialized = false;
  private loadMs = 0;
  private inferenceMs = 0;
  private windowCount = 0;
  private readonly threshold: number;
  private readonly onWindows: number;
  private readonly offWindows: number;
  private readonly clock: () => number;
  constructor(private readonly inference: DetectorInference, options: DetectorOptions = {}) {
    this.threshold = options.threshold ?? 0.6; this.onWindows = options.onWindows ?? 2; this.offWindows = options.offWindows ?? 2; this.clock = options.clock ?? (() => performance.now());
  }
  async initialize(): Promise<void> { const start = this.clock(); this.initialized = true; this.loadMs = this.clock() - start; }
  async process(window: AudioWindow): Promise<readonly SoundDetection[]> {
    if (!this.initialized) throw new Error("detector is not initialized");
    const start = this.clock(); const raw = await this.inference.infer(window); this.inferenceMs += this.clock() - start; this.windowCount++;
    const best = new Map<P0SoundId, { label: string; confidence: number }>();
    for (const item of raw) { const mapped = normalizeLabel(item.label); if (mapped && item.confidence >= 0 && item.confidence <= 1) { const prior = best.get(mapped.classId); if (!prior || item.confidence > prior.confidence) best.set(mapped.classId, { label: mapped.label, confidence: item.confidence }); } }
    const events: SoundDetection[] = [];
    for (const [id, state] of this.states) { const hit = best.get(id); if (hit && hit.confidence >= this.threshold) { state.on++; state.off = 0; state.confidence = hit.confidence; if (state.on >= this.onWindows) state.startedAtMs = state.startedAtMs || window.timestampMs; } else { state.off++; state.on = 0; if (state.off >= this.offWindows) { events.push({ classId: id, label: id, confidence: state.confidence, startedAtMs: state.startedAtMs, endedAtMs: window.timestampMs }); this.states.delete(id); } } }
    for (const [id, hit] of best) if (!this.states.has(id) && hit.confidence >= this.threshold) this.states.set(id, { startedAtMs: window.timestampMs, confidence: hit.confidence, on: 1, off: 0 });
    return events;
  }
  metrics(): DetectorMetrics { return { modelLoadMs: this.loadMs, inferenceLatencyMs: this.windowCount ? this.inferenceMs / this.windowCount : 0, windows: this.windowCount }; }
  async dispose(): Promise<void> { await this.inference.dispose?.(); this.states.clear(); this.initialized = false; }
}
