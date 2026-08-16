import { describe, expect, it, vi } from "vitest";
import { createAudioRuntime } from "../src/offscreen/runtime";
import type { SensoryGraph } from "../src/offscreen/sensory-engine";
import type { TriggerRule } from "../src/shared/settings/types";

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { getTracks: () => [track], track } as unknown as MediaStream & { track: typeof track };
}

function fakeContext() {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    destination: {},
    sampleRate: 48_000,
    createMediaStreamSource: vi.fn(() => source),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { source, context: context as unknown as AudioContext };
}

function fakeGraph(engine: SensoryGraph["engine"] = "native-sensory") {
  return {
    engine,
    setRules: vi.fn<(rules: readonly TriggerRule[], masterStrength: number) => void>(),
    setBypass: vi.fn<(enabled: boolean) => void>(),
    destroy: vi.fn<() => void>(),
  } satisfies SensoryGraph;
}

describe("offscreen tab playback", () => {
  it("uses one sensory graph route and stops cleanly", async () => {
    const stream = fakeStream();
    const { source, context } = fakeContext();
    const graph = fakeGraph("gtcrn");
    const graphFactory = vi.fn(async () => graph);
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context, graphFactory);
    const statuses: string[] = [];
    runtime.onStatus((status) => statuses.push(status.state));

    await runtime.start("tab-stream", 9);
    await runtime.start("tab-stream", 9);

    expect(context.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(graphFactory).toHaveBeenCalledTimes(1);
    expect(graphFactory).toHaveBeenCalledWith(context, source, 9, expect.any(Function));
    expect(graph.setRules).toHaveBeenCalledTimes(1);
    expect(graph.setBypass).toHaveBeenCalledWith(false);
    expect(statuses).toEqual(["capturing", "protecting"]);

    await runtime.stop();
    expect(graph.destroy).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["capturing", "protecting", "idle"]);
  });

  it("coalesces concurrent starts for the same stream and does not leak on stop", async () => {
    const stream = fakeStream();
    let releaseCapture!: () => void;
    const captureReady = new Promise<void>((resolve) => { releaseCapture = resolve; });
    const { context } = fakeContext();
    const graph = fakeGraph();
    const getUserMedia = vi.fn(async () => { await captureReady; return stream; });
    const graphFactory = vi.fn(async () => graph);
    const runtime = createAudioRuntime(getUserMedia, () => context, graphFactory);

    const firstStart = runtime.start("same-stream");
    const secondStart = runtime.start("same-stream");
    const stop = runtime.stop();
    releaseCapture();
    await Promise.all([firstStart, secondStart, stop]);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(graphFactory).toHaveBeenCalledTimes(1);
    expect(graph.destroy).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("reports exact capture failure without hiding the browser error", async () => {
    const getUserMedia = vi.fn(async () => { const error = new Error("denied"); error.name = "NotAllowedError"; throw error; });
    const { context } = fakeContext();
    const runtime = createAudioRuntime(getUserMedia, () => context, vi.fn(async () => fakeGraph()));
    const statuses: Array<{ state: string; code?: string }> = [];
    runtime.onStatus((status) => statuses.push(status));

    await runtime.start("denied");

    expect(statuses).toEqual([
      { state: "error", code: "CAPTURE_GET_USER_MEDIA_FAILED", stage: "GET_USER_MEDIA_START", rawName: "NotAllowedError", rawMessage: "denied" },
    ]);
  });

  it("stops when Chrome ends the captured track", async () => {
    const stream = fakeStream();
    const { context } = fakeContext();
    const graph = fakeGraph();
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context, vi.fn(async () => graph));
    await runtime.start("ended-stream");
    const ended = (stream.track.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as () => void;
    ended();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(graph.destroy).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("applies live bypass and the full sensory rule set without rebuilding the graph", async () => {
    const stream = fakeStream();
    const { context } = fakeContext();
    const graph = fakeGraph("rnnoise");
    const graphFactory = vi.fn(async () => graph);
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context, graphFactory);
    const statuses: string[] = [];
    runtime.onStatus((status) => statuses.push(status.state));
    await runtime.start("sensory-stream", 7);

    await runtime.setBypass(true);
    await runtime.setBypass(false);
    const rules: TriggerRule[] = [
      { id: "background-noise", enabled: true, strength: 50 },
      { id: "alarm-siren", enabled: false, strength: 90 },
      { id: "dishes-clatter", enabled: true, strength: 60 },
      { id: "applause", enabled: false, strength: 40 },
      { id: "harsh-highs", enabled: true, strength: 35 },
      { id: "sudden-loudness", enabled: true, strength: 75 },
    ];
    runtime.setRules(rules, 80);

    expect(graphFactory).toHaveBeenCalledTimes(1);
    expect(graph.setBypass).toHaveBeenNthCalledWith(1, false);
    expect(graph.setBypass).toHaveBeenNthCalledWith(2, true);
    expect(graph.setBypass).toHaveBeenNthCalledWith(3, false);
    expect(graph.setRules).toHaveBeenLastCalledWith(rules, 80);
    expect(statuses).toEqual(["capturing", "protecting", "bypassed", "protecting"]);
  });

  it("fails open to clean direct playback if the enhancement graph cannot initialize", async () => {
    const stream = fakeStream();
    const { source, context } = fakeContext();
    const graphFactory = vi.fn(async () => { throw new Error("worklet asset unavailable"); });
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context, graphFactory);
    const statuses: Array<{ state: string; code?: string; rawMessage?: string }> = [];
    runtime.onStatus((status) => statuses.push(status));

    await runtime.start("fallback-stream", 3);

    expect(source.connect).toHaveBeenCalledWith(context.destination);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(statuses[0]).toEqual({ state: "capturing" });
    expect(statuses[1]).toEqual({ state: "unavailable", code: "SENSORY_ENGINE_UNAVAILABLE", rawMessage: "worklet asset unavailable" });
  });
});

describe("background capture lifecycle", () => {
  it("gets one stream id for repeated start and closes the offscreen document", async () => {
    const listeners: Array<(message: unknown) => void> = [];
    const removed: Array<(tabId: number) => Promise<void>> = [];
    const chromeMock = {
      action: { onClicked: { addListener: vi.fn() } },
      sidePanel: { open: vi.fn(async () => undefined) },
      runtime: {
        sendMessage: vi.fn(async () => undefined),
        onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
      },
      tabs: { query: vi.fn(async () => [{ id: 12 }]), onRemoved: { addListener: (listener: (tabId: number) => Promise<void>) => removed.push(listener) } },
      tabCapture: { getMediaStreamId: vi.fn((_options: unknown, callback: (streamId: string) => void) => callback("stream-1")) },
      offscreen: { Reason: { AUDIO_PLAYBACK: "AUDIO_PLAYBACK", USER_MEDIA: "USER_MEDIA" }, hasDocument: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), createDocument: vi.fn(async () => undefined), closeDocument: vi.fn(async () => undefined) },
    };
    vi.stubGlobal("chrome", chromeMock);
    const { startProtection, stopProtection } = await import("../src/background/service-worker");
    await startProtection(7);
    await startProtection(7);
    expect(chromeMock.tabCapture.getMediaStreamId).toHaveBeenCalledTimes(1);
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "OFFSCREEN_START", streamId: "stream-1", tabId: 7 });
    expect(removed).toHaveLength(1);
    await stopProtection(7);
    expect(chromeMock.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    await stopProtection();
    await startProtection();
    expect(chromeMock.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 12 }, expect.any(Function));
    await stopProtection(12);
    vi.unstubAllGlobals();
    expect(listeners).toHaveLength(2);
  });
});

// Manual Chrome gate: load unpacked dist; play YouTube speech + background noise and
// speech + alarms/clatter; verify no ScriptProcessor warning, no crackle, audible
// suppression, clean Bypass, and real X-Ray events for five start/stop cycles.
