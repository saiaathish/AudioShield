import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_GLOBAL_STRENGTH,
  DEFAULT_HYSTERESIS,
  DEFAULT_TRIGGER_STRENGTHS,
  P0_TRIGGER_IDS,
  SETTINGS_SCHEMA_VERSION,
  type AudioShieldSettings,
  type TriggerRule,
  type TriggerId,
} from "../shared/settings/types";

export const SETTINGS_STORAGE_KEY = "audioshield.settings";

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
}

const clampUnit = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;

const clampPercent = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : fallback;

function sourceSchema(value: Record<string, unknown>): number {
  return typeof value.schemaVersion === "number" && Number.isFinite(value.schemaVersion)
    ? value.schemaVersion
    : 0;
}

/** v3 and older stored strengths as 0..1. v4 stores 0..100 everywhere. */
function normalizeStrength(value: unknown, fallback: number, schema: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clampPercent(schema <= 3 ? value * 100 : value, fallback);
}

const defaultRules = (): TriggerRule[] =>
  P0_TRIGGER_IDS.map((id) => ({
    id,
    enabled: true,
    strength: DEFAULT_TRIGGER_STRENGTHS[id],
  }));

export const defaultSettings = (): AudioShieldSettings => ({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  globalStrength: DEFAULT_GLOBAL_STRENGTH,
  triggers: defaultRules(),
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  hysteresis: DEFAULT_HYSTERESIS,
  sitePreferences: {},
});

function normalizeRule(value: unknown, id: TriggerId, schema: number): TriggerRule {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    strength: normalizeStrength(raw.strength, DEFAULT_TRIGGER_STRENGTHS[id], schema),
  };
}

function normalizeRules(value: unknown, schema: number): TriggerRule[] {
  const rawRules = Array.isArray(value) ? value : [];
  const byId = new Map(
    rawRules
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => [item.id, item]),
  );
  return P0_TRIGGER_IDS.map((id) => normalizeRule(byId.get(id), id, schema));
}

function normalizeSitePreferences(value: unknown, schema: number): AudioShieldSettings["sitePreferences"] {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, Partial<Pick<AudioShieldSettings, "globalStrength" | "triggers">>> = {};
  for (const [site, preference] of Object.entries(value as Record<string, unknown>)) {
    if (!preference || typeof preference !== "object") continue;
    const raw = preference as Record<string, unknown>;
    const next: { globalStrength?: number; triggers?: readonly TriggerRule[] } = {};
    if (raw.globalStrength !== undefined) {
      next.globalStrength = normalizeStrength(raw.globalStrength, DEFAULT_GLOBAL_STRENGTH, schema);
    }
    if (Array.isArray(raw.triggers)) next.triggers = normalizeRules(raw.triggers, schema);
    result[site] = next;
  }
  return result;
}

export function migrateSettings(value: unknown): AudioShieldSettings {
  const defaults = defaultSettings();
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Record<string, unknown>;
  const schema = sourceSchema(raw);

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    globalStrength: normalizeStrength(raw.globalStrength, defaults.globalStrength, schema),
    triggers: normalizeRules(raw.triggers, schema),
    confidenceThreshold: clampUnit(raw.confidenceThreshold, defaults.confidenceThreshold),
    hysteresis: clampUnit(raw.hysteresis, defaults.hysteresis),
    sitePreferences: normalizeSitePreferences(raw.sitePreferences, schema),
  };
}

export async function loadSettings(storage: StorageArea): Promise<AudioShieldSettings> {
  try {
    return migrateSettings((await storage.get(SETTINGS_STORAGE_KEY))[SETTINGS_STORAGE_KEY]);
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(storage: StorageArea, settings: AudioShieldSettings): Promise<void> {
  await storage.set({ [SETTINGS_STORAGE_KEY]: migrateSettings(settings) });
}

export function normalizeSiteKey(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}
