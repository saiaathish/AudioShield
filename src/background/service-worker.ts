type Session = { tabId: number; streamId: string };
type PublicStatus = {
  state: string;
  tabId?: number;
  engine?: string;
  code?: string;
  stage?: string;
  rawName?: string;
  rawMessage?: string;
  chromeMessage?: string;
  scheme?: string;
  host?: string;
};

let session: Session | undefined;
let creatingOffscreen: Promise<void> | undefined;
let bypassed = false;
let lifecycle: Promise<void> = Promise.resolve();
let lastStatus: PublicStatus = { state: "idle" };

async function disableAutomaticPanelAction(): Promise<void> {
  if (!chrome.sidePanel || typeof chrome.sidePanel.setPanelBehavior !== "function") return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    const panelApi = chrome.sidePanel as typeof chrome.sidePanel & { getPanelBehavior?: () => Promise<{ openPanelOnActionClick?: boolean }> };
    const behavior = await panelApi.getPanelBehavior?.();
    if (behavior && behavior.openPanelOnActionClick !== false) {
      console.error("[AudioShield][capture]", { stage: "sidePanel.setPanelBehavior", code: "SIDEPANEL_AUTO_ACTION_NOT_DISABLED", behavior: behavior.openPanelOnActionClick });
    }
  } catch (error) {
    console.error("[AudioShield][capture]", { stage: "sidePanel.setPanelBehavior", code: "SIDEPANEL_BEHAVIOR_CONFIG_FAILED", chromeMessage: error instanceof Error ? error.message : String(error) });
  }
}
void disableAutomaticPanelAction();
if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(() => { void disableAutomaticPanelAction(); });
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { void disableAutomaticPanelAction(); });

function sendStatus(status: PublicStatus): Promise<void> {
  lastStatus = status;
  return chrome.runtime.sendMessage({ type: "ENGINE_STATUS", status }).then(() => undefined).catch(() => undefined);
}

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (tabId === undefined) { void sendStatus({ state: "error", code: "CAPTURE_NO_TAB_ID" }); return; }
  const url = tab.url ?? "";
  if (/^(chrome|chrome-extension|devtools|edge|about):/i.test(url) || /chrome.google.com\/webstore/i.test(url)) {
    void sendStatus({ state: "error", code: "CAPTURE_RESTRICTED_PAGE", tabId });
    return;
  }

  if (session?.tabId === tabId) {
    void chrome.sidePanel.open({ tabId } as Parameters<typeof chrome.sidePanel.open>[0]).catch((error) => reportSidePanelFailure(error));
    void sendStatus({ state: bypassed ? "bypassed" : "protecting", tabId, ...(bypassed ? {} : { engine: "dsp-hybrid" }) });
    return;
  }

  // This must stay the first privileged/asynchronous capture invocation from the action gesture.
  chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
    const lastError = chrome.runtime.lastError;
    if (lastError) { reportCaptureFailure(tabId, url, lastError.message ?? "UNKNOWN_CHROME_ERROR"); return; }
    if (typeof streamId !== "string" || streamId.length === 0) {
      reportCaptureFailure(tabId, url, "Chrome returned an empty stream ID", "CAPTURE_EMPTY_STREAM_ID");
      return;
    }
    void consumeActionStream(tabId, streamId);
  });

  void chrome.sidePanel.open({ tabId } as Parameters<typeof chrome.sidePanel.open>[0]).catch((error) => reportSidePanelFailure(error));
});

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = lifecycle.then(task, task);
  lifecycle = next.catch(() => undefined);
  return next;
}

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"] as chrome.offscreen.Reason[],
    justification: "Capture the tab stream in the offscreen document, process it locally, and play the result.",
  }).finally(() => { creatingOffscreen = undefined; });
  await creatingOffscreen;
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new Error("No active tab available for capture");
  return tab.id;
}

function streamIdForTab(tabId: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const failure = new Error(error.message);
        failure.name = "CAPTURE_STREAM_ID_FAILED";
        reject(failure);
      } else if (!id) {
        const failure = new Error("Chrome returned an empty tab capture stream ID");
        failure.name = "CAPTURE_EMPTY_STREAM_ID";
        reject(failure);
      } else resolve(id);
    });
  });
}

function reportSidePanelFailure(error: unknown): void {
  console.error("[AudioShield][capture]", { stage: "sidePanel.open", code: "SIDEPANEL_OPEN_FAILED", chromeMessage: error instanceof Error ? error.message : String(error) });
}

function reportCaptureFailure(tabId: number, url: string, chromeMessage: string, code = "CAPTURE_STREAM_ID_FAILED"): void {
  const parsed = (() => {
    try {
      const value = new URL(url);
      return { scheme: value.protocol.replace(":", ""), host: value.hostname };
    } catch {
      return { scheme: "unknown", host: "" };
    }
  })();
  console.error("[AudioShield][capture]", { stage: "getMediaStreamId", code, chromeMessage, tabId, scheme: parsed.scheme });
  void sendStatus({ state: "error", code, chromeMessage, tabId, scheme: parsed.scheme, host: parsed.host });
}

async function consumeActionStream(tabId: number, streamId: string): Promise<void> {
  await enqueue(async () => {
    // The stream ID is short-lived. Reuse the offscreen document while switching tabs
    // instead of closing/recreating it after the ID has already been issued.
    if (session) await stopProtectionInternal(session.tabId, false, false);
    try {
      await ensureOffscreen();
      session = { tabId, streamId };
      await sendStatus({ state: "starting", tabId });
      await chrome.runtime.sendMessage({ type: "OFFSCREEN_START", streamId, tabId });
      if (bypassed) await chrome.runtime.sendMessage({ type: "BYPASS_SET", enabled: true });
    } catch (error) {
      session = undefined;
      await closeOffscreen();
      reportCaptureFailure(tabId, "", error instanceof Error ? error.message : String(error), "OFFSCREEN_START_FAILED");
    }
  });
}

async function closeOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument().catch(() => undefined);
}

async function stopProtectionInternal(tabId?: number, emitIdle = true, closeDocument = true): Promise<void> {
  if (!session || (tabId !== undefined && session.tabId !== tabId)) return;
  session = undefined;
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" }).catch(() => undefined);
  if (closeDocument) await closeOffscreen();
  if (emitIdle) await sendStatus({ state: "idle" });
}

async function startProtectionInternal(requestedTabId?: number): Promise<void> {
  const tabId = requestedTabId ?? await activeTabId();
  if (session?.tabId === tabId) return;
  if (session) await stopProtectionInternal(session.tabId);

  let offscreenReady = false;
  try {
    const streamId = await streamIdForTab(tabId);
    await ensureOffscreen();
    offscreenReady = true;
    session = { tabId, streamId };
    await sendStatus({ state: "starting", tabId });
    await chrome.runtime.sendMessage({ type: "OFFSCREEN_START", streamId, tabId });
    if (bypassed) await chrome.runtime.sendMessage({ type: "BYPASS_SET", enabled: true });
  } catch (error) {
    session = undefined;
    if (offscreenReady) {
      await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" }).catch(() => undefined);
      await closeOffscreen();
    }
    const code = error instanceof Error && error.name.startsWith("CAPTURE_") ? error.name : offscreenReady ? "OFFSCREEN_START_FAILED" : "CAPTURE_STREAM_ID_FAILED";
    await sendStatus({ state: "error", code, rawMessage: error instanceof Error ? error.message : String(error), tabId });
  }
}

export function startProtection(tabId?: number): Promise<void> {
  return enqueue(() => startProtectionInternal(tabId));
}

export function stopProtection(tabId?: number): Promise<void> {
  return enqueue(() => stopProtectionInternal(tabId));
}

chrome.runtime.onMessage.addListener((message: { type: string; tabId?: number }) => {
  if (message.type === "PROTECTION_START") void startProtection(message.tabId);
  if (message.type === "PROTECTION_STOP") void stopProtection(message.tabId);
  if (message.type === "ENGINE_STATUS_REQUEST") void sendStatus(lastStatus);

  if (message.type === "BYPASS_SET" && typeof (message as { enabled?: unknown }).enabled === "boolean") {
    bypassed = Boolean((message as unknown as { enabled: boolean }).enabled);
    void chrome.runtime.sendMessage({ type: "BYPASS_SET", enabled: bypassed }).catch(() => undefined);
    if (session) void sendStatus(bypassed
      ? { state: "bypassed", tabId: session.tabId }
      : { state: "protecting", tabId: session.tabId, engine: "dsp-hybrid" });
  }

  if (message.type === "PROTECTION_RULES_UPDATE") {
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => void stopProtection(tabId));

chrome.runtime.onMessage.addListener((message: {
  type: string;
  status?: { state: string; code?: string; stage?: string; rawName?: string; rawMessage?: string; chromeMessage?: string };
}) => {
  if (message.type !== "OFFSCREEN_STATUS" || !message.status) return;
  const tabId = session?.tabId;

  if (message.status.state === "idle") {
    if (!session) void sendStatus({ state: "idle" });
    return;
  }
  if (message.status.state === "capturing") {
    if (tabId !== undefined) void sendStatus({ state: "capturing", tabId });
    return;
  }
  if (message.status.state === "protecting") {
    if (tabId !== undefined) void sendStatus({ state: "protecting", tabId, engine: "dsp-hybrid" });
    return;
  }
  if (message.status.state === "bypassed") {
    if (tabId !== undefined) void sendStatus({ state: "bypassed", tabId });
    return;
  }
  if (message.status.state === "unavailable") {
    if (tabId !== undefined) void sendStatus({ state: "unavailable", tabId, code: "SEPARATOR_UNAVAILABLE" });
    return;
  }
  if (message.status.state === "error") {
    session = undefined;
    void sendStatus({
      state: "error",
      code: message.status.code ?? "CAPTURE_RUNTIME_FAILED",
      stage: message.status.stage,
      rawName: message.status.rawName,
      rawMessage: message.status.rawMessage,
      chromeMessage: message.status.chromeMessage,
      tabId,
    });
    void closeOffscreen();
  }
});
