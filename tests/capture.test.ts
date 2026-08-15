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
    expect(statuses).toEqual(["unavailable", "idle"]);
  });

  it("fails closed and reports capture failure without retrying", async () => {
    const getUserMedia = vi.fn(async () => { throw new Error("denied"); });
    const runtime = createAudioRuntime(getUserMedia, () => ({ destination: {}, createMediaStreamSource: vi.fn(), resume: vi.fn(), close: vi.fn(async () => undefined) }));
    const statuses: string[] = [];
    runtime.onStatus((status) => statuses.push(status.state));
    await runtime.start("denied");
    await runtime.start("denied");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(["error", "error"]);
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
    expect(statuses).toEqual(["unavailable", "bypassed", "capturing"]);
  });

  it("uses one hybrid processing route when the context supports processing", async () => {
    const stream = fakeStream();
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const processor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null as ((event: unknown) => void) | null };
    const context = { destination: {}, createMediaStreamSource: vi.fn(() => source), createScriptProcessor: vi.fn(() => processor), resume: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    const runtime = createAudioRuntime(vi.fn(async () => stream), () => context);
    const statuses: string[] = [];
    runtime.onStatus((status) => statuses.push(status.state));
    await runtime.start("hybrid-stream");
    expect(source.connect).toHaveBeenCalledWith(processor);
    expect(processor.connect).toHaveBeenCalledWith(context.destination);
    expect(statuses).toEqual(["protecting"]);
    const speech = Float32Array.from({ length: 64 }, (_, index) => Math.sin(2 * Math.PI * 2 * index / 64) * 0.4);
    const transient = Float32Array.from({ length: 64 }, (_, index) => Math.sin(2 * Math.PI * 20 * index / 64) * 0.4);
    const run = (input: Float32Array) => {
      const output = new Float32Array(input.length);
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => input, sampleRate: 16_000, numberOfChannels: 1 }, outputBuffer: { getChannelData: () => output, numberOfChannels: 1 } });
      return output;
    };
    expect(run(speech)).toEqual(speech);
    expect(run(transient)).not.toEqual(transient);
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
      runtime: {
        sendMessage: vi.fn(async () => undefined),
        onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
      },
      tabs: { onRemoved: { addListener: (listener: (tabId: number) => Promise<void>) => removed.push(listener) } },
      tabCapture: { getMediaStreamId: vi.fn((_options: unknown, callback: (streamId: string) => void) => callback("stream-1")) },
      offscreen: { Reason: { AUDIO_PLAYBACK: "AUDIO_PLAYBACK" }, hasDocument: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), createDocument: vi.fn(async () => undefined), closeDocument: vi.fn(async () => undefined) },
    };
    vi.stubGlobal("chrome", chromeMock);
    const { startProtection, stopProtection } = await import("../src/background/service-worker");
    await startProtection(7);
    await startProtection(7);
    expect(chromeMock.tabCapture.getMediaStreamId).toHaveBeenCalledTimes(1);
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "OFFSCREEN_START", streamId: "stream-1" });
    expect(removed).toHaveLength(1);
    // Invoke the same cleanup path used by tabs.onRemoved; direct call keeps the mock deterministic.
    await stopProtection(7);
    expect(chromeMock.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    await stopProtection();
    vi.unstubAllGlobals();
    expect(listeners).toHaveLength(2);
  });
});

// Manual Chrome check (requires a real user gesture): load unpacked build; open HTML5/YouTube media;
// click Protect this tab; verify tab remains audible; close/reopen UI; stop; repeat 10 cycles; close tab;
// inspect chrome://webrtc-internals or DevTools to confirm one output route and no raw-audio requests.
