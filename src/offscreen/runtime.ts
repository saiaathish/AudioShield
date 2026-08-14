export type OffscreenStatus =
  | { state: "capturing" }
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
};

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

  const emit = (status: OffscreenStatus) => statusListener?.(status);
  const cleanup = async () => {
    const oldSource = source;
    const oldStream = stream;
    const oldContext = context;
    source = undefined;
    stream = undefined;
    context = undefined;
    oldSource?.disconnect();
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
        source.connect(context.destination); // Exactly one output route.
        await context.resume();
        // UnavailableSeparator is intentionally fail-closed: playback remains one
        // pass-through route, while the UI receives no false selective claim.
        emit(bypassed ? { state: "bypassed" } : { state: "unavailable", code: "SEPARATOR_UNAVAILABLE" });
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
