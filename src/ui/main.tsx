import { useEffect, useMemo, useState } from "react";
import type { RuntimeMessage, EngineStatus } from "../shared/messages/types";
import type { SensoryEvent } from "../shared/events/types";
import type { TriggerId, TriggerRule } from "../shared/settings/types";
import "./styles.css";

export interface UiRuntime {
  send(message: RuntimeMessage): void;
  subscribe(listener: (message: RuntimeMessage) => void): () => void;
  activeTabId?(): Promise<number | null>;
}

export const labels: Partial<Record<TriggerId, { name: string; icon: string; hint: string }>> = {
  "alarm-siren": { name: "Alarms & sirens", icon: "◌", hint: "Urgent, piercing sounds" },
};

const initialRules: TriggerRule[] = [
  { id: "alarm-siren", enabled: true, strength: 78 },
];

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

export function statusCopy(status: EngineStatus, protectedTab: boolean) {
  if (status.state === "error") return { title: "Needs attention", detail: `${status.code}${status.stage ? ` — Stage: ${status.stage}` : ""}${status.rawMessage ? ` — Chrome: ${status.rawMessage}` : status.chromeMessage ? ` — Chrome: ${status.chromeMessage}` : ""}` };
  if (status.state === "unavailable") return { title: "Protection unavailable", detail: "Selective separation is unavailable; audio remains unchanged" };
  if (status.state === "protecting") return { title: "Protecting this tab", detail: "Local DSP protection active" };
  if (status.state === "loading-models" || status.state === "starting") return { title: "Starting protection", detail: "Capturing this tab and activating local DSP" };
  if (status.state === "bypassed") return { title: "Bypass on", detail: "Protection paused for this tab" };
  if (protectedTab) return { title: "Protection requested", detail: "Waiting for the local DSP engine to confirm availability" };
  return { title: "Protection off", detail: "Start protection when you need it" };
}

function Meter({ value, label }: { value: number; label: string }) {
  return <div className="meter" aria-label={label}><span style={{ width: `${value}%` }} /></div>;
}

function EventRow({ event }: { event: SensoryEvent }) {
  const label = labels[event.triggerId];
  return <li className="event-row">
    <span className="event-dot" aria-hidden="true" />
    <span className="event-main"><strong>{label?.name ?? event.triggerId}</strong><small>{new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span>
    <span className="event-value"><b>{Math.round(event.confidence * 100)}%</b><small>confidence</small></span>
    <span className="event-value"><b>—</b><small>attenuation unavailable</small></span>
  </li>;
}

export function App({ runtime = chromeRuntime }: { runtime?: UiRuntime }) {
  const [protectedTab, setProtectedTab] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [bypass, setBypass] = useState(false);
  const [rules, setRules] = useState(initialRules);
  const [strength, setStrength] = useState(65);
  const [events, setEvents] = useState<SensoryEvent[]>([]);
  const [status, setStatus] = useState<EngineStatus>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => runtime.subscribe((message) => {
    if (message.type === "SENSORY_EVENT") setEvents((current) => [message.event, ...current].slice(0, 8));
    if (message.type === "ENGINE_STATUS") { setStatus(message.status); setProtectedTab(["starting", "capturing", "protecting", "bypassed"].includes(message.status.state)); setError(null); }
    if (message.type === "ENGINE_ERROR") setError(message.error.message);
  }), [runtime]);

  const copy = statusCopy(status, protectedTab);
  const activeCount = rules.filter((rule) => rule.enabled).length;
  const toggleProtection = () => {
    const next = !protectedTab;
    setProtectedTab(next);
    if (!next) { if (activeTabId !== null) runtime.send({ type: "PROTECTION_STOP", tabId: activeTabId }); return; }
    void runtime.activeTabId?.().then((tabId) => { if (tabId !== null && tabId !== undefined) { setActiveTabId(tabId); runtime.send({ type: "PROTECTION_START", tabId }); } });
  };
  const sendRules = (nextRules: TriggerRule[], nextStrength = strength) => runtime.send({ type: "PROTECTION_RULES_UPDATE", rules: nextRules, masterStrength: nextStrength });
  const toggleRule = (id: TriggerId) => setRules((current) => { const next = current.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule); sendRules(next); return next; });
  const updateStrength = (id: TriggerId, value: number) => setRules((current) => { const next = current.map((rule) => rule.id === id ? { ...rule, strength: value } : rule); sendRules(next); return next; });
  const updateMasterStrength = (value: number) => { setStrength(value); sendRules(rules, value); };
  const themeLabel = useMemo(() => bypass ? "Bypass" : protectedTab ? "Protected" : "Off", [bypass, protectedTab]);

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">AS</span><span>AudioShield</span></div><span className={`mode mode-${themeLabel.toLowerCase()}`}><i />{themeLabel}</span></header>
    <section className="hero" aria-labelledby="page-title">
      <div><p className="eyebrow">SENSORY PROTECTION</p><h1 id="page-title">Make sound<br /><em>work for you.</em></h1><p className="intro">Choose what to soften. Audio stays on your device.</p></div>
      <button className={`protect-button ${protectedTab ? "is-on" : ""}`} aria-pressed={protectedTab} onClick={toggleProtection}><span className="button-glyph" aria-hidden="true">{protectedTab ? "✓" : "◒"}</span><span>{protectedTab ? "Protection on" : "Protect this tab"}</span><small>{protectedTab ? `${activeCount} triggers active` : "Start local listening"}</small></button>
    </section>
    <section className={`status-banner ${status.state === "error" || error ? "is-error" : ""}`} aria-live="polite"><span className="status-orb" aria-hidden="true" /><div><strong>{error ? "Protection unavailable" : copy.title}</strong><p>{error ?? copy.detail}</p></div>{(error || status.state === "error") && <button className="text-button" onClick={() => { setError(null); setStatus({ state: "idle" }); }}>Dismiss</button>}</section>
    <section className="section" aria-labelledby="triggers-title"><div className="section-heading"><div><p className="eyebrow">01 / SELECTIVE FILTERS</p><h2 id="triggers-title">What should we soften?</h2></div><span className="count">{activeCount} of {rules.length} on</span></div><div className="trigger-list">{rules.map((rule) => <article className={`trigger ${rule.enabled ? "active" : ""}`} key={rule.id}><button className="trigger-toggle" role="switch" aria-checked={rule.enabled} onClick={() => toggleRule(rule.id)}><span className="trigger-icon" aria-hidden="true">{labels[rule.id]?.icon ?? "◌"}</span><span className="trigger-copy"><strong>{labels[rule.id]?.name ?? rule.id}</strong><small>{labels[rule.id]?.hint ?? "Supported tonal protection"}</small></span><span className="switch" aria-hidden="true"><i /></span></button>{rule.enabled && <label className="range-label">attenuation <input type="range" min="0" max="100" value={rule.strength} onChange={(event) => updateStrength(rule.id, Number(event.target.value))} aria-label={`${labels[rule.id]?.name ?? rule.id} attenuation`} /><output>{rule.strength}%</output></label>}</article>)}</div></section>
    <section className="section controls" aria-labelledby="controls-title"><div className="section-heading"><div><p className="eyebrow">02 / CONTROL</p><h2 id="controls-title">Protection strength</h2></div><output>{strength}%</output></div><input className="master-range" type="range" min="0" max="100" value={strength} onChange={(event) => updateMasterStrength(Number(event.target.value))} aria-label="Global protection strength" /><div className="control-notes"><span>Gentle</span><span>Balanced</span><span>Firm</span></div><div className="preserve"><span className="check" aria-hidden="true">✓</span><div><strong>Tonal alarm protection</strong><small>Deterministic local DSP; supported for alarms and sirens.</small></div></div></section>
    <section className="section xray" aria-labelledby="xray-title"><div className="section-heading"><div><p className="eyebrow">03 / SENSORY X-RAY</p><h2 id="xray-title">Detection timeline</h2></div><span className="live-label"><i /> {status.state === "protecting" ? "live" : "unavailable"}</span></div>{events.length ? <ol className="event-list" aria-label="Recent sensory events">{events.map((event, index) => <EventRow event={event} key={`${event.timestamp}-${index}`} />)}</ol> : <div className="empty-state"><span className="empty-wave" aria-hidden="true">∿</span><strong>{status.state === "protecting" ? "No events yet" : "Detection unavailable"}</strong><p>{status.state === "protecting" ? "Detector events will appear here when reported by the local runtime." : "No detector or attenuation metrics are available."}</p></div>}<div className="before-after"><div><span>detected</span><Meter value={events[0] ? Math.round(events[0].confidence * 100) : 0} label="Detected signal confidence" /></div><div><span>after</span><small>Not measured</small></div></div></section>
    <footer className="footer"><span className="privacy"><span className="lock" aria-hidden="true">▣</span><span><strong>Private by design</strong><small>Audio is processed locally. Never uploaded.</small></span></span><button className="bypass" aria-pressed={bypass} onClick={() => { const next = !bypass; setBypass(next); runtime.send({ type: "BYPASS_SET", enabled: next }); }}>{bypass ? "Turn protection back on" : "Bypass protection"}</button></footer>
  </main>;
}

export function mountUi(root: HTMLElement, runtime?: UiRuntime): void { createRoot(root).render(<App runtime={runtime} />); }

import { createRoot } from "react-dom/client";
const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root) mountUi(root);
