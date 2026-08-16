export const P0_TRIGGER_IDS = [
  "background-noise",
  "alarm-siren",
  "dishes-clatter",
  "applause",
  "harsh-highs",
  "sudden-loudness",
] as const;
export type TriggerId = (typeof P0_TRIGGER_IDS)[number];

export const SETTINGS_SCHEMA_VERSION = 3 as const;
export const DEFAULT_GLOBAL_STRENGTH = 0.8;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_HYSTERESIS = 0.1;
export interface TriggerRule { readonly id: TriggerId; readonly enabled: boolean; readonly strength: number; }
export interface AudioShieldSettings { readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION; readonly globalStrength: number; readonly triggers: readonly TriggerRule[]; readonly confidenceThreshold: number; readonly hysteresis: number; readonly sitePreferences: Readonly<Record<string, Partial<Pick<AudioShieldSettings, "globalStrength" | "triggers">>>>; }
