export type OffscreenStatus =
  | { state: "capturing" }
  | { state: "protecting"; engine: "dsp-hybrid" }
  | { state: "idle" }
  | { state: "unavailable"; code: "SEPARATOR_UNAVAILABLE" }
  | { state: "bypassed" }
  | { state: "error"; code: string };

export interface AudioRuntime {
  start(streamId: string): Promise<void>;
  stop(): Promise<void>;
  setBypass(enabled: boolean): Promise<void>;
  onStatus(listener: (status: OffscreenStatus) => void): void;
}

type AudioContextLike = {
  createMediaStreamSource(stream: MediaStream): { connect(destination: unknown): void; disconnect(): void };
  destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createScriptProcessor?: (bufferSize?: number, inputChannels?: number, outputChannels?: number) => AudioProcessorNodeLike;
};
type AudioProcessorNodeLike = { connect(destination: unknown): void; disconnect(): void; onaudioprocess?: ((event: any) => void) | null };
type AudioProcessEventLike = { inputBuffer: { getChannelData(channel: number): Float32Array; sampleRate: number; numberOfChannels: number }; outputBuffer: { getChannelData(channel: number): Float32Array; numberOfChannels: number } };

export function createAudioRuntime(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  createContext: () => AudioContextLike = () => new AudioContext(),
): AudioRuntime {
  let stream: MediaStream | undefined;
  let source: ReturnType<AudioContextLike["createMediaStreamSource"]> | undefined;
  let context: AudioContextLike | undefined;
  let statusListener: ((status: OffscreenStatus) => void) | undefined;
  let stopping = false;
  let bypassed = false;
  let processor: AudioProcessorNodeLike | undefined;
  let separator: import("../ml/separator/types").SeparatorEngine | undefined;

  const emit = (status: OffscreenStatus) => statusListener?.(status);
  const cleanup = async () => {
    const oldSource = source;
    const oldStream = stream;
    const oldContext = context;
    const oldProcessor = processor;
    source = undefined;
    stream = undefined;
    context = undefined;
    processor = undefined;
    separator = undefined;
    oldSource?.disconnect();
    oldProcessor?.disconnect();
    oldStream?.getTracks().forEach((track) => track.stop());
    if (oldContext) await oldContext.close();
  };

  return {
    onStatus(listener) { statusListener = listener; },
    async setBypass(enabled) {
      bypassed = enabled;
      if (stream) emit(enabled ? { state: "bypassed" } : { state: "capturing" });
    },
    async start(nextStreamId) {
      if (stream || stopping) return;
      try {
        context = createContext();
        stream = await getUserMedia({ audio: { // Chrome tabCapture stream; never persisted.
          mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: nextStreamId },
        } } as MediaStreamConstraints);
        stream.getTracks().forEach((track) => track.addEventListener("ended", () => { void this.stop(); }));
        source = context.createMediaStreamSource(stream);
        if (!bypassed && context.createScriptProcessor) {
          const { HybridDspSeparator } = await import("../ml/separator/hybrid-dsp");
          separator = new HybridDspSeparator();
          await separator.initialize();
          processor = context.createScriptProcessor(1024, 1, 1);
          processor.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);
            const request = { frame: { sampleRate: event.inputBuffer.sampleRate, channels: event.inputBuffer.numberOfChannels, samples: input }, targetClassId: "dishes" };
            const result = separator?.processSync?.(request);
            if (result) output.set(result.frame.samples);
          };
          source.connect(processor);
          processor.connect(context.destination); // Exactly one source -> processing -> destination route.
        } else {
          source.connect(context.destination); // Bypass/fallback identity route, exactly once.
        }
        await context.resume();
        emit(bypassed ? { state: "bypassed" } : separator ? { state: "protecting", engine: "dsp-hybrid" } : { state: "unavailable", code: "SEPARATOR_UNAVAILABLE" });
      } catch {
        await cleanup();
        emit({ state: "error", code: "CAPTURE_START_FAILED" });
      }
    },
    async stop() {
      if (stopping) return;
      stopping = true;
      try { await cleanup(); emit({ state: "idle" }); } finally { stopping = false; }
    },
  };
}
