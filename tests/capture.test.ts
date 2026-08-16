import { describe, expect, it, vi } from "vitest";
import { createAudioRuntime } from "../src/offscreen/runtime";

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { getTracks: () => [track], track } as unknown as MediaStream & { track: typeof track };
}

describe("offscreen tab playback", () => {
  it("routes one captured stream to destination and stops cleanly", async () => {
    const stream = fakeStream();
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = { destination: {}, createMediaStreamSource: vi.fn(() => source), resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context);
    const statuses: string[] = [];
    runtime.onStatus((status) => statuses.push(status.state));
    await runtime.start("tab-stream");
    await runtime.start("tab-stream");
    expect(context.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["capturing", "unavailable", "idle"]);
  });

  it("coalesces concurrent starts for the same stream and does not leak on stop", async () => {
    const stream = fakeStream();
    let releaseCapture!: () => void;
    const captureReady = new Promise<void>((resolve) => { releaseCapture = resolve; });
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = { destination: {}, createMediaStreamSource: vi.fn(() => source), resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const getUserMedia = vi.fn(async () => { await captureReady; return stream; });
    const runtime = createAudioRuntime(getUserMedia, () => context);
    const firstStart = runtime.start("same-stream");
    const secondStart = runtime.start("same-stream");
    const stop = runtime.stop();
    releaseCapture();
    await Promise.all([firstStart, secondStart, stop]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("fails closed and reports capture failure without retrying", async () => {
    const getUserMedia = vi.fn(async () => { const error = new Error("denied"); error.name = "NotAllowedError"; throw error; });
    const runtime = createAudioRuntime(getUserMedia, () => ({ destination: {}, createMediaStreamSource: vi.fn(), resume: vi.fn(), close: vi.fn(async () => undefined) }));
    const statuses: Array<{ state: string; code?: string }> = [];
    runtime.onStatus((status) => statuses.push(status));
    await runtime.start("denied");
    await runtime.start("denied");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual([
      { state: "error", code: "CAPTURE_GET_USER_MEDIA_FAILED", stage: "GET_USER_MEDIA_START", rawName: "NotAllowedError", rawMessage: "denied" },
      { state: "error", code: "CAPTURE_GET_USER_MEDIA_FAILED", stage: "GET_USER_MEDIA_START", rawName: "NotAllowedError", rawMessage: "denied" },
    ]);
  });

  it("stops when Chrome ends the captured track", async () => {
    const stream = fakeStream();
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = { destination: {}, createMediaStreamSource: vi.fn(() => source), resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context);
    await runtime.start("ended-stream");
    const ended = (stream.track.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as () => void;
    ended();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("reports bypass without adding a second playback route", async () => {
    const stream = fakeStream();
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = { destination: {}, createMediaStreamSource: vi.fn(() => source), resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context);
    const statuses: string[] = [];
    runtime.onStatus((status) => statuses.push(status.state));
    await runtime.start("bypass-stream");
    await runtime.setBypass(true);
    await runtime.setBypass(false);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["capturing", "unavailable", "bypassed", "capturing"]);
  });

  it("uses one valid stereo processing route and applies live bypass/rule changes", async () => {
    const stream = fakeStream();
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as ((event: any) => void) | null };
    const context = { destination: {}, createMediaStreamSource: vi.fn(() => source), createScriptProcessor: vi.fn(() => processor), resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context);
    const statuses: string[] = [];
    const events: Array<{ attenuationDb?: number }> = [];
    runtime.onStatus((status) => statuses.push(status.state));
    runtime.onSensoryEvent((event) => events.push(event));
    await runtime.start("hybrid-stream", 7);
    expect(source.connect).toHaveBeenCalledWith(processor);
    expect(processor.connect).toHaveBeenCalledWith(context.destination);
    expect(context.createScriptProcessor).toHaveBeenCalledWith(1024, 2, 2);
    expect(statuses).toEqual(["capturing", "protecting"]);

    const sampleRate = 16_000;
    const alarm = Float32Array.from({ length: 1024 }, (_, index) =>
      0.18 * Math.sin(2 * Math.PI * 180 * index / sampleRate) + 0.42 * Math.sin(2 * Math.PI * 1200 * index / sampleRate));
    const run = (input: Float32Array) => {
      const left = new Float32Array(input.length);
      const right = new Float32Array(input.length);
      processor.onaudioprocess?.({
        inputBuffer: { getChannelData: () => input, sampleRate, numberOfChannels: 1 },
        outputBuffer: { getChannelData: (channel: number) => channel === 0 ? left : right, numberOfChannels: 2 },
      });
      return left;
    };

    const protectedOutput = run(alarm);
    expect(protectedOutput).not.toEqual(alarm);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].attenuationDb).toBeLessThan(0);

    await runtime.setBypass(true);
    expect(run(alarm)).toEqual(alarm);
    await runtime.setBypass(false);
    runtime.setRules(false, 78);
    expect(run(alarm)).toEqual(alarm);
    runtime.setRules(true, 100);
    expect(run(alarm)).not.toEqual(alarm);

    await runtime.stop();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(processor.disconnect).toHaveBeenCalledTimes(1);
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

// Manual Chrome check (requires a real user gesture): load unpacked build; open HTML5/YouTube media;
// click the AudioShield toolbar icon once; verify tab remains audible; toggle Alarm and Bypass live;
// close/reopen UI; repeat 5 cycles; inspect the service-worker/offscreen consoles for runtime errors.
