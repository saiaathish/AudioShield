import { createAudioRuntime } from "./runtime";
import type { TriggerRule } from "../shared/settings/types";

const runtime = createAudioRuntime((constraints) => navigator.mediaDevices.getUserMedia(constraints));

runtime.onStatus((status) => {
  void chrome.runtime.sendMessage({ type: "OFFSCREEN_STATUS", status }).catch(() => undefined);
});
runtime.onSensoryEvent((event) => {
  void chrome.runtime.sendMessage({ type: "SENSORY_EVENT", event }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: {
  type: string;
  streamId?: string;
  tabId?: number;
  rules?: TriggerRule[];
  masterStrength?: number;
  enabled?: boolean;
}) => {
  if (message.type === "OFFSCREEN_START" && message.streamId) void runtime.start(message.streamId, message.tabId);
  if (message.type === "OFFSCREEN_STOP") void runtime.stop();
  if (message.type === "BYPASS_SET") void runtime.setBypass(Boolean(message.enabled));
  if (message.type === "PROTECTION_RULES_UPDATE") {
    runtime.setRules(message.rules ?? [], Math.max(0, Math.min(100, message.masterStrength ?? 65)));
  }
});
