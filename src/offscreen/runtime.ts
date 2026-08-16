import type { SensoryEvent } from "../shared/events/types";

export type OffscreenStatus =
  | { state: "capturing" }
  | { state: "protecting"; engine: "dsp-hybrid" }
  | { state: "idle" }
  | { state: "unavailable"; code: "SEPARATOR_UNAVAILABLE" }
  | { state: "bypassed" }
  | { state: "error"; code: string; stage?: string; rawName?: string; rawMessage?: string };

export interface AudioRuntime {
  start(streamId: string, tabId?: number): Promise<void>;
  stop(): Promise<void>;
  setBypass(enabled: boolean): Promise<void>;
  setRules(enabled: boolean, strength: number): void;
  onStatus(listener: (status: OffscreenStatus) => void): void;
  onSensoryEvent(listener: (event: SensoryEvent) => void): void;
}

type AudioContextLike = {
  createMediaStreamSource(stream: MediaStream): { connect(destination: unknown): void; disconnect(): void };
  destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createScriptProcessor?: (bufferSize?: number, inputChannels?: number, outputChannels?: number) => AudioProcessorNodeLike;
};
type AudioProcessorNodeLike = { connect(destination: unknown): void; disconnect(): void; onaudioprocess?: ((event: AudioProcessEventLike) => void) | null };
type AudioProcessEventLike = { inputBuffer: { getChannelData(channel: number): Float32Array; sampleRate: number; numberOfChannels: number }; outputBuffer: { getChannelData(channel: number): Float32Array; numberOfChannels: number } };

export function createAudioRuntime(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  createContext: () => AudioContextLike = () => new AudioContext(),
): AudioRuntime {
  let stream: MediaStream | undefined;
  let streamId: string | undefined;
  let currentTabId = -1;
  let source: ReturnType<AudioContextLike["createMediaStreamSource"]> | undefined;
  let context: AudioContextLike | undefined;
  let statusListener: ((status: OffscreenStatus) => void) | undefined;
  let eventListener: ((event: SensoryEvent) => void) | undefined;
  let stopping = false;
  let bypassed = false;
  let processor: AudioProcessorNodeLike | undefined;
  let separator: import("../ml/separator/types").SeparatorEngine | undefined;
  let alarmEnabled = true;
  let alarmStrength = 78;
  let lifecycle: Promise<void> = Promise.resolve();
  let lastEventAt = 0;

  const emit = (status: OffscreenStatus) => statusListener?.(status);
  const emitSensoryEvent = (result: import("../ml/separator/types").SeparatorResult) => {
    const diagnostics = result.diagnostics;
    if (!diagnostics?.detected || result.targetAttenuationDb >= -0.1 || currentTabId < 0) return;
    const now = Date.now();
    if (now - lastEventAt < 250) return;
    lastEventAt = now;
    eventListener?.({
      triggerId: "alarm-siren",
      confidence: Math.max(0, Math.min(1, diagnostics.confidence ?? 0)),
      timestamp: now,
      tabId: currentTabId,
      attenuationDb: result.targetAttenuationDb,
      dominantFrequencyHz: diagnostics.dominantFrequencyHz,
      active: true,
    });
  };

  const cleanup = async (): Promise<boolean> => {
    const oldSource = source;
    const oldStream = stream;
    const oldContext = context;
    const oldProcessor = processor;
    const oldSeparator = separator;
    const hadResources = Boolean(oldSource || oldStream || oldContext || oldProcessor || oldSeparator);
    source = undefined;
    stream = undefined;
    streamId = undefined;
    currentTabId = -1;
    context = undefined;
    processor = undefined;
    separator = undefined;
    lastEventAt = 0;
    try { oldSource?.disconnect(); } catch { /* already disconnected */ }
    try { oldProcessor?.disconnect(); } catch { /* already disconnected */ }
    oldStream?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* track already stopped */ }
    });
    try { await oldSeparator?.dispose(); } catch { /* cleanup must continue */ }
    try { if (oldContext) await oldContext.close(); } catch { /* context already closed */ }
    return hadResources;
  };

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const next = lifecycle.then(task, task);
    lifecycle = next.catch(() => undefined);
    return next;
  };

  const stopInternal = async () => {
    if (stopping) return;
    stopping = true;
    try {
      if (await cleanup()) emit({ state: "idle" });
    } finally {
      stopping = false;
    }
  };

  const startInternal = async (nextStreamId: string, nextTabId = -1) => {
    if (stream) {
      if (streamId === nextStreamId) return;
      await stopInternal();
    }

    let stage = "OFFSCREEN_START_MESSAGE";
    try {
      stage = "GET_USER_MEDIA_START";
      stream = await getUserMedia({ audio: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: nextStreamId },
      } } as MediaStreamConstraints);
      streamId = nextStreamId;
      currentTabId = nextTabId;
      stage = "GET_USER_MEDIA_SUCCESS";
      stream.getTracks().forEach((track) => track.addEventListener("ended", () => { void enqueue(stopInternal); }));

      stage = "AUDIO_CONTEXT_CREATE";
      context = createContext();
      stage = "MEDIA_STREAM_SOURCE_CREATE";
      source = context.createMediaStreamSource(stream);
      emit({ state: "capturing" });

      if (context.createScriptProcessor) {
        stage = "DSP_INITIALIZE";
        const { HybridDspSeparator } = await import("../ml/separator/hybrid-dsp");
        separator = new HybridDspSeparator();
        await separator.initialize();

        stage = "PROCESSOR_CREATE";
        processor = context.createScriptProcessor(1024, 2, 2);
        processor.onaudioprocess = (event) => {
          const inputChannels = Math.max(1, event.inputBuffer.numberOfChannels);
          const outputChannels = Math.max(1, event.outputBuffer.numberOfChannels);
          let eventResult: import("../ml/separator/types").SeparatorResult | undefined;

          for (let channel = 0; channel < outputChannels; channel += 1) {
            const input = event.inputBuffer.getChannelData(Math.min(channel, inputChannels - 1));
            const output = event.outputBuffer.getChannelData(channel);
            let samples: Float32Array = input;

            if (!bypassed && alarmEnabled) {
              try {
                const strength = Math.max(0, Math.min(100, alarmStrength));
                const result = separator?.processSync?.({
                  frame: { sampleRate: event.inputBuffer.sampleRate, channels: 1, samples: input },
                  targetClassId: "alarm-siren",
                  attenuationDb: -(strength / 100) * 18,
                });
                if (result) {
                  samples = result.frame.samples;
                  if (channel === 0) eventResult = result;
                }
              } catch {
                samples = input;
              }
            }

            output.set(samples.subarray(0, output.length));
            if (samples.length < output.length) output.fill(0, samples.length);
          }

          if (!bypassed && alarmEnabled && eventResult) emitSensoryEvent(eventResult);
        };

        stage = "AUDIO_GRAPH_CONNECT";
        source.connect(processor);
        processor.connect(context.destination);
      } else {
        stage = "AUDIO_GRAPH_CONNECT";
        source.connect(context.destination);
      }

      stage = "AUDIO_CONTEXT_RESUME";
      await context.resume();
      emit(bypassed
        ? { state: "bypassed" }
        : processor && separator
          ? { state: "protecting", engine: "dsp-hybrid" }
          : { state: "unavailable", code: "SEPARATOR_UNAVAILABLE" });
    } catch (error) {
      const rawName = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "UnknownError";
      const rawMessage = error instanceof Error ? error.message : String(error);
      await cleanup();
      const code = stage === "GET_USER_MEDIA_START" ? "CAPTURE_GET_USER_MEDIA_FAILED"
        : stage === "AUDIO_CONTEXT_CREATE" ? "AUDIO_CONTEXT_CREATE_FAILED"
          : stage === "AUDIO_CONTEXT_RESUME" ? "AUDIO_CONTEXT_RESUME_FAILED"
            : stage === "MEDIA_STREAM_SOURCE_CREATE" ? "MEDIA_STREAM_SOURCE_FAILED"
              : stage === "DSP_INITIALIZE" ? "DSP_INITIALIZE_FAILED"
                : stage === "PROCESSOR_CREATE" ? "AUDIO_PROCESSOR_CREATE_FAILED"
                  : stage === "AUDIO_GRAPH_CONNECT" ? "AUDIO_GRAPH_CONNECT_FAILED"
                    : "CAPTURE_RUNTIME_FAILED";
      emit({ state: "error", code, stage, rawName, rawMessage });
    }
  };

  return {
    onStatus(listener) { statusListener = listener; },
    onSensoryEvent(listener) { eventListener = listener; },
    setBypass(enabled) {
      return enqueue(async () => {
        bypassed = enabled;
        if (!stream) return;
        emit(enabled
          ? { state: "bypassed" }
          : processor && separator
            ? { state: "protecting", engine: "dsp-hybrid" }
            : { state: "capturing" });
      });
    },
    setRules(enabled: boolean, strength: number) {
      alarmEnabled = enabled;
      alarmStrength = Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) : alarmStrength;
    },
    start(nextStreamId, tabId) {
      return enqueue(() => startInternal(nextStreamId, tabId));
    },
    stop() {
      return enqueue(stopInternal);
    },
  };
}
