import { createAudioRuntime } from "./runtime";

const runtime = createAudioRuntime((constraints) => navigator.mediaDevices.getUserMedia(constraints));

runtime.onStatus((status) => chrome.runtime.sendMessage({ type: "ENGINE_STATUS", status }));
chrome.runtime.onMessage.addListener((message: { type: string; streamId?: string }) => {
  if (message.type === "OFFSCREEN_START" && message.streamId) void runtime.start(message.streamId);
  if (message.type === "OFFSCREEN_STOP") void runtime.stop();
});

