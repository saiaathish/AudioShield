export const P0_SOUND_IDS = ["alarm-siren", "dishes-clatter", "applause", "protected-speech"] as const;
export type P0SoundId = (typeof P0_SOUND_IDS)[number];

export interface SoundDetection {
  readonly classId: P0SoundId;
  readonly label: string;
  readonly confidence: number;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
}

export interface AudioWindow {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly timestampMs: number;
}

export interface InferenceLabel { readonly label: string; readonly confidence: number; }
export interface DetectorInference {
  initialize?(): Promise<void>;
  infer(window: AudioWindow): Promise<readonly InferenceLabel[]>;
  dispose?(): Promise<void> | void;
}
export interface DetectorMetrics {
  readonly modelLoadMs: number;
  readonly inferenceLatencyMs: number;
  readonly p50InferenceLatencyMs: number;
  readonly p95InferenceLatencyMs: number;
  readonly windows: number;
}
export interface SoundDetector {
  initialize(): Promise<void>;
  process(window: AudioWindow): Promise<readonly SoundDetection[]>;
  metrics(): DetectorMetrics;
  dispose(): Promise<void>;
}
