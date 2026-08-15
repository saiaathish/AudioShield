type Session = { tabId: number; streamId: string };
let session: Session | undefined;
let creatingOffscreen: Promise<void> | undefined;
let bypassed = false;

const sendStatus = (status: unknown) => chrome.runtime.sendMessage({ type: "ENGINE_STATUS", status }).catch(() => undefined);

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    // @types/chrome lags the MV3 reason enum; Chrome supports AUDIO_PLAYBACK.
    reasons: ["AUDIO_PLAYBACK" as chrome.offscreen.Reason],
    justification: "Route captured tab audio back to the user while processing stays offscreen.",
  }).finally(() => { creatingOffscreen = undefined; });
  await creatingOffscreen;
}

export async function startProtection(tabId: number): Promise<void> {
  if (session?.tabId === tabId) return;
  if (session) await stopProtection(session.tabId);
  try {
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });
    await ensureOffscreen();
    session = { tabId, streamId };
    await chrome.runtime.sendMessage({ type: "OFFSCREEN_START", streamId });
    if (bypassed) await chrome.runtime.sendMessage({ type: "BYPASS_SET", enabled: true });
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
  if (message.type === "BYPASS_SET" && typeof (message as { enabled?: unknown }).enabled === "boolean") {
    bypassed = Boolean((message as unknown as { enabled: boolean }).enabled);
    void chrome.runtime.sendMessage({ type: "BYPASS_SET", enabled: bypassed }).catch(() => undefined);
    void sendStatus(bypassed ? { state: "bypassed", tabId: session?.tabId ?? -1 } : { state: "capturing", tabId: session?.tabId ?? -1 });
  }
});
chrome.tabs.onRemoved.addListener((tabId) => void stopProtection(tabId));
chrome.runtime.onMessage.addListener((message: { type: string; status?: { state: string; code?: string } }) => {
  if (message.type !== "ENGINE_STATUS" || !message.status) return;
  if (message.status.state === "idle") session = undefined;
  if (message.status.state === "protecting") {
    void sendStatus({ state: "protecting", tabId: session?.tabId ?? -1, engine: "dsp-hybrid" });
  }
  if (message.status.state === "unavailable") {
    void sendStatus({ state: "unavailable", tabId: session?.tabId ?? -1, code: "SEPARATOR_UNAVAILABLE" });
  }
});
