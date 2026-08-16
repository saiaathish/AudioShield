import { describe, expect, it } from "vitest";
import { labels, statusCopy } from "../src/ui/main";
import type { RuntimeMessage } from "../src/shared/messages/types";

describe("popup UI contracts", () => {
  it("names every sensory trigger for accessible controls", () => {
    expect(Object.keys(labels)).toEqual([
      "background-noise",
      "alarm-siren",
      "glass-shatter",
      "dishes-clatter",
      "applause",
      "harsh-highs",
      "sudden-loudness",
    ]);
    expect(Object.values(labels).every((item) => item.name && item.hint)).toBe(true);
  });

  it("accepts mocked runtime messages without coupling to audio internals", () => {
    const messages: RuntimeMessage[] = [];
    const mockRuntime = { send: (message: RuntimeMessage) => messages.push(message), subscribe: () => () => undefined };
    mockRuntime.send({ type: "BYPASS_SET", enabled: true });
    mockRuntime.send({ type: "PROTECTION_START", tabId: 7 });
    expect(messages.map((message) => message.type)).toEqual(["BYPASS_SET", "PROTECTION_START"]);
  });

  it("does not present requested protection as active or hide fallbacks", () => {
    expect(statusCopy({ state: "idle" }, true).title).toBe("Protection requested");
    expect(statusCopy({ state: "unavailable", tabId: 7, code: "SENSORY_ENGINE_UNAVAILABLE" }, true).detail).toMatch(/unavailable/i);
    expect(statusCopy({ state: "protecting", tabId: 7, engine: "gtcrn" }, true).detail).toMatch(/GTCRN/i);
    expect(statusCopy({ state: "protecting", tabId: 7, engine: "rnnoise" }, true).detail).toMatch(/RNNoise/i);
  });
});
