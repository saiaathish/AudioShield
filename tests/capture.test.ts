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
    expect(statuses).toEqual(["capturing", "idle"]);
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
});

// Manual Chrome check (requires a real user gesture): load unpacked build; open HTML5/YouTube media;
// click Protect this tab; verify tab remains audible; close/reopen UI; stop; repeat 10 cycles; close tab;
// inspect chrome://webrtc-internals or DevTools to confirm one output route and no raw-audio requests.

