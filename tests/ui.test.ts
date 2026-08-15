import { describe, expect, it } from "vitest";
import { labels, statusCopy } from "../src/ui/main";
import type { RuntimeMessage } from "../src/shared/messages/types";

describe("popup UI contracts", () => {
  it("names every P0 trigger for accessible controls", () => {
    expect(Object.keys(labels)).toEqual(["alarm-siren", "dishes-clatter", "applause"]);
    expect(Object.values(labels).every((item) => item.name && item.hint)).toBe(true);
  });

  it("accepts mocked runtime messages without coupling to audio internals", () => {
    const messages: RuntimeMessage[] = [];
    const mockRuntime = { send: (message: RuntimeMessage) => messages.push(message), subscribe: () => () => undefined };
    mockRuntime.send({ type: "BYPASS_SET", enabled: true });
    mockRuntime.send({ type: "PROTECTION_START", tabId: 7 });
    expect(messages.map((message) => message.type)).toEqual(["BYPASS_SET", "PROTECTION_START"]);
  });

  it("does not present requested protection as active or measured", () => {
    expect(statusCopy({ state: "idle" }, true).title).toBe("Protection requested");
    expect(statusCopy({ state: "unavailable", tabId: 7, code: "SEPARATOR_UNAVAILABLE" }, true).detail).toMatch(/unavailable/i);
    expect(statusCopy({ state: "protecting", tabId: 7, engine: "dsp-hybrid" }, true).title).toBe("Protecting this tab");
  });
});
