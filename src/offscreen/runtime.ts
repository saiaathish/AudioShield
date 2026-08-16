import type { SensoryEvent } from "../shared/events/types";
import type { TriggerRule } from "../shared/settings/types";
import { createSensoryGraph, type SensoryEngineName, type SensoryGraph } from "./sensory-engine";

export type OffscreenStatus =
  | { state: "capturing" }
  | { state: "protecting"; engine: SensoryEngineName }
  | { state: "idle" }
  | { state: "unavailable"; code: "SENSORY_ENGINE_UNAVAILABLE"; rawMessage?: string }
  | { state: "bypassed" }
  | { state: "error"; code: string; stage?: string; rawName?: string; rawMessage?: string };

export interface AudioRuntime {
  start(streamId: string, tabId?: number): Promise<void>;
  stop(): Promise<void>;
  setBypass(enabled: boolean): Promise<void>;
  setRules(rules: readonly TriggerRule[], masterStrength: number): void;
  onStatus(listener: (status: OffscreenStatus) => void): void;
  onSensoryEvent(listener: (event: SensoryEvent) => void): void;
}

type GraphFactory = (
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  tabId: number,
  emitEvent: (event: SensoryEvent) => void,
) => Promise<SensoryGraph>;

const DEFAULT_RULES: readonly TriggerRule[] = [
  { id: "background-noise", enabled: true, strength: 72 },
  { id: "alarm-siren", enabled: true, strength: 82 },
  { id: "dishes-clatter", enabled: true, strength: 56 },
  { id: "applause", enabled: true, strength: 46 },
  { id: "harsh-highs", enabled: true, strength: 42 },
  { id: "sudden-loudness", enabled: true, strength: 62 },
];

export function createAudioRuntime(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  createContext: () => AudioContext = () => new AudioContext({ sampleRate: 48_000, latencyHint: "interactive" }),
  createGraph: GraphFactory = createSensoryGraph,
): AudioRuntime {
  let stream: MediaStream | undefined;
  let streamId: string | undefined;
  let currentTabId = -1;
  let source: MediaStreamAudioSourceNode | undefined;
  let context: AudioContext | undefined;
  let graph: SensoryGraph | undefined;
  let directFallbackConnected = false;
  let statusListener: ((status: OffscreenStatus) => void) | undefined;
  let eventListener: ((event: SensoryEvent) => void) | undefined;
  let stopping = false;
  let bypassed = false;
  let lifecycle: Promise<void> = Promise.resolve();
  let rules: readonly TriggerRule[] = DEFAULT_RULES;
  let masterStrength = 65;

  const emit = (status: OffscreenStatus) => statusListener?.(status);
  const emitSensoryEvent = (event: SensoryEvent) => eventListener?.(event);

  const cleanup = async (): Promise<boolean> => {
    const oldSource = source;
    const oldStream = stream;
    const oldContext = context;
    const oldGraph = graph;
    const hadResources = Boolean(oldSource || oldStream || oldContext || oldGraph);

    source = undefined;
    stream = undefined;
    streamId = undefined;
    currentTabId = -1;
    context = undefined;
    graph = undefined;
    directFallbackConnected = false;

    try { oldGraph?.destroy(); } catch { /* cleanup continues */ }
    try { oldSource?.disconnect(); } catch { /* already disconnected */ }
    oldStream?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* already stopped */ }
    });
    try { if (oldContext) await oldContext.close(); } catch { /* already closed */ }
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
      stream = await getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: nextStreamId },
        },
      } as MediaStreamConstraints);
      streamId = nextStreamId;
      currentTabId = nextTabId;
      stream.getTracks().forEach((track) => track.addEventListener("ended", () => { void enqueue(stopInternal); }));

      stage = "AUDIO_CONTEXT_CREATE";
      context = createContext();
      stage = "MEDIA_STREAM_SOURCE_CREATE";
      source = context.createMediaStreamSource(stream);
      emit({ state: "capturing" });

      stage = "SENSORY_GRAPH_INITIALIZE";
      try {
        graph = await createGraph(context, source, currentTabId, emitSensoryEvent);
        graph.setRules(rules, masterStrength);
        graph.setBypass(bypassed);
      } catch (engineError) {
        // Tab capture mutes the tab's normal playback route. If the enhancement
        // stack cannot initialize, preserve audible playback instead of leaving
        // the user with silence or a broken stream.
        source.connect(context.destination);
        directFallbackConnected = true;
        const rawMessage = engineError instanceof Error ? engineError.message : String(engineError);
        console.error("[AudioShield][sensory] enhancement graph unavailable; using direct local playback", engineError);
        emit({ state: "unavailable", code: "SENSORY_ENGINE_UNAVAILABLE", rawMessage });
      }

      stage = "AUDIO_CONTEXT_RESUME";
      await context.resume();

      if (graph) {
        emit(bypassed ? { state: "bypassed" } : { state: "protecting", engine: graph.engine });
      } else if (!directFallbackConnected) {
        emit({ state: "unavailable", code: "SENSORY_ENGINE_UNAVAILABLE" });
      }
    } catch (error) {
      const rawName = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "UnknownError";
      const rawMessage = error instanceof Error ? error.message : String(error);
      await cleanup();
      const code = stage === "GET_USER_MEDIA_START" ? "CAPTURE_GET_USER_MEDIA_FAILED"
        : stage === "AUDIO_CONTEXT_CREATE" ? "AUDIO_CONTEXT_CREATE_FAILED"
          : stage === "AUDIO_CONTEXT_RESUME" ? "AUDIO_CONTEXT_RESUME_FAILED"
            : stage === "MEDIA_STREAM_SOURCE_CREATE" ? "MEDIA_STREAM_SOURCE_FAILED"
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
        graph?.setBypass(enabled);
        if (!stream) return;
        if (graph) emit(enabled ? { state: "bypassed" } : { state: "protecting", engine: graph.engine });
        else emit({ state: "unavailable", code: "SENSORY_ENGINE_UNAVAILABLE" });
      });
    },
    setRules(nextRules, nextMasterStrength) {
      rules = nextRules.length ? nextRules : DEFAULT_RULES;
      masterStrength = Number.isFinite(nextMasterStrength) ? Math.max(0, Math.min(100, nextMasterStrength)) : masterStrength;
      graph?.setRules(rules, masterStrength);
    },
    start(nextStreamId, tabId) {
      return enqueue(() => startInternal(nextStreamId, tabId));
    },
    stop() {
      return enqueue(stopInternal);
    },
  };
}
