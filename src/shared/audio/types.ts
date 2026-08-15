export type AudioSource = "tab";

export interface AudioFrame { readonly sampleRate: number; readonly channels: number; readonly samples: Float32Array; }
export interface AudioCapture { start(tabId: number): Promise<void>; stop(): Promise<void>; }
export interface AudioProcessor { process(frame: AudioFrame): AudioFrame; }
