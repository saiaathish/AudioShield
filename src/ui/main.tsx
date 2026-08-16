import { useEffect, useMemo, useState } from "react";
import type { RuntimeMessage, EngineStatus } from "../shared/messages/types";
import type { SensoryEvent } from "../shared/events/types";
import type { TriggerId, TriggerRule } from "../shared/settings/types";
import { defaultSettings, loadSettings, saveSettings, type StorageArea } from "../storage/settings";
import "./styles.css";

export interface UiRuntime {
  send(message: RuntimeMessage): void;
  subscribe(listener: (message: RuntimeMessage) => void): () => void;
  activeTabId?(): Promise<number | null>;
}

export const labels: Partial<Record<TriggerId, { name: string; icon: string; hint: string }>> = {
  "background-noise": { name: "Background noise", icon: "≈", hint: "Neural voice-first denoising for steady environmental noise" },
  "alarm-siren": { name: "Alarms & high tones", icon: "◌", hint: "Tracks persistent piercing tones such as alarms, sirens, and sharp beeps" },
  "glass-shatter": { name: "Glass & brittle crashes", icon: "◇", hint: "Routes high-flux brittle transients such as glass breaks and sharp crashes" },
  "dishes-clatter": { name: "Clatter & sharp impacts", icon: "✦", hint: "Softens dishes, hard clicks, and broadband impact bursts" },
  applause: { name: "Crowd & applause", icon: "✺", hint: "Tames dense bursts without muting the whole tab" },
  "harsh-highs": { name: "Harsh highs & hiss", icon: "⌁", hint: "Reduces abrasive upper-frequency energy" },
  "sudden-loudness": { name: "Sudden loudness", icon: "↧", hint: "Fast local compression catches startling peaks" },
};

const initialSettings = defaultSettings();
const initialRules: TriggerRule[] = [...initialSettings.triggers];

function chromeStorage(): StorageArea | null {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return null;
  return {
    get: async (key) => await storage.get(key) as Record<string, unknown>,
    set: async (value) => { await storage.set(value); },
  };
}

const chromeRuntime: UiRuntime = {
  send: (message) => { if (globalThis.chrome?.runtime) void chrome.runtime.sendMessage(message); },
  subscribe: (listener) => {
    if (!globalThis.chrome?.runtime?.onMessage) return () => undefined;
    const handler = (message: RuntimeMessage) => listener(message);
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  },
  activeTabId: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ?? null,
};

function engineName(status: Extract<EngineStatus, { state: "protecting" }>): string {
  if (status.engine === "gtcrn") return "GTCRN neural + sensory routing";
  if (status.engine === "rnnoise") return "RNNoise neural + sensory routing";
  return "Adaptive sensory routing";
}

export function statusCopy(status: EngineStatus, protectedTab: boolean) {
  if (status.state === "error") return { title: "Needs attention", detail: `${status.code}${status.stage ? ` — Stage: ${status.stage}` : ""}${status.rawMessage ? ` — Chrome: ${status.rawMessage}` : status.chromeMessage ? ` — Chrome: ${status.chromeMessage}` : ""}` };
  if (status.state === "unavailable") return { title: "Protection fallback", detail: status.rawMessage ? `Enhanced processing unavailable — ${status.rawMessage}` : "Enhanced processing unavailable; direct local playback is preserved" };
  if (status.state === "protecting") return { title: "Protecting this tab", detail: `${engineName(status)} is active locally` };
  if (status.state === "capturing") return { title: "Starting protection", detail: "Tab audio captured; loading the local sensory engine" };
  if (status.state === "loading-models" || status.state === "starting") return { title: "Starting protection", detail: "Activating local AudioWorklet processing" };
  if (status.state === "bypassed") return { title: "Bypass on", detail: "Protection paused for this tab" };
  if (protectedTab) return { title: "Protection requested", detail: "Waiting for the local sensory engine" };
  return { title: "Protection off", detail: "Click the AudioShield toolbar icon on a tab with audio to start" };
}

function Meter({ value, label }: { value: number; label: string }) {
  return <div className="meter" aria-label={label}><span style={{ width: `${value}%` }} /></div>;
}

function EventRow({ event }: { event: SensoryEvent }) {
  const label = labels[event.triggerId];
  const applied = typeof event.attenuationDb === "number" ? `${event.attenuationDb.toFixed(1)} dB` : "active";
  const detail = typeof event.dominantFrequencyHz === "number" ? `${Math.round(event.dominantFrequencyHz)} Hz` : "sensory pattern";
  return <li className="event-row">
    <span className="event-dot" aria-hidden="true" />
    <span className="event-main"><strong>{label?.name ?? event.triggerId}</strong><small>{new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {detail}</small></span>
    <span className="event-value"><b>{Math.round(event.confidence * 100)}%</b><small>routing score</small></span>
    <span className="event-value"><b>{applied}</b><small>applied</small></span>
  </li>;
}

export function App({ runtime = chromeRuntime }: { runtime?: UiRuntime }) {
  const [protectedTab, setProtectedTab] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [bypass, setBypass] = useState(false);
  const [rules, setRules] = useState<TriggerRule[]>(initialRules);
  const [strength, setStrength] = useState(initialSettings.globalStrength);
  const [events, setEvents] = useState<SensoryEvent[]>([]);
  const [status, setStatus] = useState<EngineStatus>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = runtime.subscribe((message) => {
      if (message.type === "SENSORY_EVENT") setEvents((current) => [message.event, ...current].slice(0, 8));
      if (message.type === "ENGINE_STATUS") {
        setStatus(message.status);
        setProtectedTab(["starting", "capturing", "protecting", "bypassed", "unavailable"].includes(message.status.state));
        setBypass(message.status.state === "bypassed");
        if ("tabId" in message.status && typeof message.status.tabId === "number" && message.status.tabId >= 0) setActiveTabId(message.status.tabId);
        setError(null);
      }
      if (message.type === "ENGINE_ERROR") setError(message.error.message);
    });

    runtime.send({ type: "ENGINE_STATUS_REQUEST" });
    const storage = chromeStorage();
    if (!storage) {
      runtime.send({ type: "PROTECTION_RULES_UPDATE", rules: initialRules, masterStrength: initialSettings.globalStrength });
    } else {
      void loadSettings(storage).then((saved) => {
        if (!mounted) return;
        const savedRules = [...saved.triggers];
        setRules(savedRules);
        setStrength(saved.globalStrength);
        runtime.send({ type: "PROTECTION_RULES_UPDATE", rules: savedRules, masterStrength: saved.globalStrength });
      });
    }

    return () => { mounted = false; unsubscribe(); };
  }, [runtime]);

  const copy = statusCopy(status, protectedTab);
  const activeCount = rules.filter((rule) => rule.enabled).length;

  const persistAndSend = (nextRules: TriggerRule[], nextStrength: number) => {
    runtime.send({ type: "PROTECTION_RULES_UPDATE", rules: nextRules, masterStrength: nextStrength });
    const storage = chromeStorage();
    if (!storage) return;
    void saveSettings(storage, {
      ...initialSettings,
      globalStrength: nextStrength,
      triggers: nextRules,
    }).catch(() => undefined);
  };

  const toggleProtection = () => {
    if (protectedTab) {
      if (activeTabId !== null) runtime.send({ type: "PROTECTION_STOP", tabId: activeTabId });
      else void runtime.activeTabId?.().then((tabId) => { if (tabId !== null && tabId !== undefined) runtime.send({ type: "PROTECTION_STOP", tabId }); });
      return;
    }
    void runtime.activeTabId?.().then((tabId) => {
      if (tabId !== null && tabId !== undefined) {
        setActiveTabId(tabId);
        runtime.send({ type: "PROTECTION_START", tabId });
      }
    });
  };

  const toggleRule = (id: TriggerId) => setRules((current) => {
    const next = current.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule);
    persistAndSend(next, strength);
    return next;
  });

  const updateStrength = (id: TriggerId, value: number) => setRules((current) => {
    const next = current.map((rule) => rule.id === id ? { ...rule, strength: value } : rule);
    persistAndSend(next, strength);
    return next;
  });

  const updateMasterStrength = (value: number) => {
    setStrength(value);
    persistAndSend(rules, value);
  };

  const themeLabel = useMemo(() => bypass ? "Bypass" : protectedTab ? "Protected" : "Off", [bypass, protectedTab]);

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">AS</span><span>AudioShield</span></div><span className={`mode mode-${themeLabel.toLowerCase()}`}><i />{themeLabel}</span></header>
    <section className="hero" aria-labelledby="page-title">
      <div><p className="eyebrow">SENSORY PROTECTION</p><h1 id="page-title">Make sound<br /><em>work for you.</em></h1><p className="intro">AudioShield responds to sensory patterns — steady noise, piercing tones, brittle crashes, clatter, harsh highs, and sudden loudness — instead of flattening the whole tab.</p></div>
      <button className={`protect-button ${protectedTab ? "is-on" : ""}`} aria-pressed={protectedTab} onClick={toggleProtection}><span className="button-glyph" aria-hidden="true">{protectedTab ? "✓" : "◒"}</span><span>{protectedTab ? "Protection on" : "Start protection"}</span><small>{protectedTab ? `${activeCount} sensory filters active` : "Use on the current audio tab"}</small></button>
    </section>
    <section className={`status-banner ${status.state === "error" || error ? "is-error" : ""}`} aria-live="polite"><span className="status-orb" aria-hidden="true" /><div><strong>{error ? "Protection unavailable" : copy.title}</strong><p>{error ?? copy.detail}</p></div>{(error || status.state === "error") && <button className="text-button" onClick={() => { setError(null); setStatus({ state: "idle" }); }}>Dismiss</button>}</section>
    <section className="section" aria-labelledby="triggers-title"><div className="section-heading"><div><p className="eyebrow">01 / SENSORY PROFILES</p><h2 id="triggers-title">What should we soften?</h2></div><span className="count">{activeCount} of {rules.length} on</span></div><div className="trigger-list">{rules.map((rule) => <article className={`trigger ${rule.enabled ? "active" : ""}`} key={rule.id}><button className="trigger-toggle" role="switch" aria-checked={rule.enabled} onClick={() => toggleRule(rule.id)}><span className="trigger-icon" aria-hidden="true">{labels[rule.id]?.icon ?? "◌"}</span><span className="trigger-copy"><strong>{labels[rule.id]?.name ?? rule.id}</strong><small>{labels[rule.id]?.hint ?? "Local sensory protection"}</small></span><span className="switch" aria-hidden="true"><i /></span></button>{rule.enabled && <label className="range-label">strength <input type="range" min="0" max="100" step="1" value={rule.strength} onChange={(event) => updateStrength(rule.id, Number(event.target.value))} aria-label={`${labels[rule.id]?.name ?? rule.id} strength`} /><output>{rule.strength}%</output></label>}</article>)}</div></section>
    <section className="section controls" aria-labelledby="controls-title"><div className="section-heading"><div><p className="eyebrow">02 / CONTROL</p><h2 id="controls-title">Protection strength</h2></div><output>{strength}%</output></div><input className="master-range" type="range" min="0" max="100" step="1" value={strength} onChange={(event) => updateMasterStrength(Number(event.target.value))} aria-label="Global protection strength" /><div className="control-notes"><span>Gentle</span><span>Balanced</span><span>Firm</span></div><div className="preserve"><span className="check" aria-hidden="true">✓</span><div><strong>Foreground-first routing + neural DSP</strong><small>Piercing and brittle foreground patterns can pre-empt broad denoising. Every 1% step changes the processing amount continuously, and your choices persist locally.</small></div></div></section>
    <section className="section xray" aria-labelledby="xray-title"><div className="section-heading"><div><p className="eyebrow">03 / SENSORY X-RAY</p><h2 id="xray-title">Why AudioShield reacted</h2></div><span className="live-label"><i /> {status.state === "protecting" ? "live" : "standby"}</span></div>{events.length ? <ol className="event-list" aria-label="Recent sensory routing events">{events.map((event, index) => <EventRow event={event} key={`${event.timestamp}-${index}`} />)}</ol> : <div className="empty-state"><span className="empty-wave" aria-hidden="true">∿</span><strong>{status.state === "protecting" ? "Protection is live" : "Start AudioShield on a tab"}</strong><p>{status.state === "protecting" ? "Routing scores show which sensory profile matched. Applied dB is the processing command, not a claimed classifier probability or measured source separation." : "Your local sensory events will show up here once processing starts."}</p></div>}<div className="before-after"><div><span>routing</span><Meter value={events[0] ? Math.round(events[0].confidence * 100) : 0} label="Sensory routing score" /></div><div><span>applied</span><small>{typeof events[0]?.attenuationDb === "number" ? `${events[0].attenuationDb.toFixed(1)} dB` : "Waiting for event"}</small></div></div></section>
    <footer className="footer"><span className="privacy"><span className="lock" aria-hidden="true">▣</span><span><strong>Private by design</strong><small>All tab audio processing and preferences stay inside the extension.</small></span></span><button className="bypass" aria-pressed={bypass} onClick={() => { const next = !bypass; setBypass(next); runtime.send({ type: "BYPASS_SET", enabled: next }); }}>{bypass ? "Turn protection back on" : "Bypass protection"}</button></footer>
  </main>;
}

export function mountUi(root: HTMLElement, runtime?: UiRuntime): void { createRoot(root).render(<App runtime={runtime} />); }

import { createRoot } from "react-dom/client";
const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root) mountUi(root);
