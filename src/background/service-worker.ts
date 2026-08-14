type Session = { tabId: number; streamId: string };
let session: Session | undefined;
let creatingOffscreen: Promise<void> | undefined;

const sendStatus = (status: unknown) => chrome.runtime.sendMessage({ type: "ENGINE_STATUS", status }).catch(() => undefined);

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: "src/offscreen/offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Route captured tab audio back to the user while processing stays offscreen.",
  }).finally(() => { creatingOffscreen = undefined; });
  await creatingOffscreen;
}

export async function startProtection(tabId: number): Promise<void> {
  if (session?.tabId === tabId) return;
  if (session) await stopProtection(session.tabId);
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreen();
    session = { tabId, streamId };
    await chrome.runtime.sendMessage({ type: "OFFSCREEN_START", streamId });
    await sendStatus({ state: "capturing", tabId });
  } catch {
    session = undefined;
    await sendStatus({ state: "error", code: "CAPTURE_START_FAILED" });
  }
}

export async function stopProtection(tabId?: number): Promise<void> {
  if (!session || (tabId !== undefined && session.tabId !== tabId)) return;
  session = undefined;
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" }).catch(() => undefined);
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument().catch(() => undefined);
  await sendStatus({ state: "idle" });
}

chrome.runtime.onMessage.addListener((message: { type: string; tabId?: number }) => {
  if (message.type === "PROTECTION_START" && message.tabId !== undefined) void startProtection(message.tabId);
  if (message.type === "PROTECTION_STOP") void stopProtection(message.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => void stopProtection(tabId));
chrome.runtime.onMessage.addListener((message: { type: string; status?: { state: string } }) => {
  if (message.type === "ENGINE_STATUS" && message.status?.state === "idle") session = undefined;
});
