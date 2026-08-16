import { createAudioRuntime } from "./runtime";

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
  rules?: { id: string; enabled: boolean; strength: number }[];
  masterStrength?: number;
}) => {
  if (message.type === "OFFSCREEN_START" && message.streamId) void runtime.start(message.streamId, message.tabId);
  if (message.type === "OFFSCREEN_STOP") void runtime.stop();
  if (message.type === "BYPASS_SET") void runtime.setBypass(Boolean((message as { enabled?: boolean }).enabled));
  if (message.type === "PROTECTION_RULES_UPDATE") {
    const alarm = message.rules?.find((rule) => rule.id === "alarm-siren");
    runtime.setRules(Boolean(alarm?.enabled), Math.min(alarm?.strength ?? 78, message.masterStrength ?? 100));
  }
});
