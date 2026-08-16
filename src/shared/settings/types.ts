export const P0_TRIGGER_IDS = [
  "background-noise",
  "alarm-siren",
  "glass-shatter",
  "dishes-clatter",
  "applause",
  "harsh-highs",
  "sudden-loudness",
] as const;
export type TriggerId = (typeof P0_TRIGGER_IDS)[number];

/**
 * Strengths are canonical percentages everywhere in the extension: 0..100.
 * Confidence/hysteresis remain unit values: 0..1.
 */
export const SETTINGS_SCHEMA_VERSION = 4 as const;
export const DEFAULT_GLOBAL_STRENGTH = 65;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_HYSTERESIS = 0.1;
export const DEFAULT_TRIGGER_STRENGTHS: Readonly<Record<TriggerId, number>> = {
  "background-noise": 72,
  "alarm-siren": 82,
  "glass-shatter": 74,
  "dishes-clatter": 56,
  applause: 46,
  "harsh-highs": 42,
  "sudden-loudness": 62,
};

export interface TriggerRule {
  readonly id: TriggerId;
  readonly enabled: boolean;
  /** Percentage, inclusive: 0..100. */
  readonly strength: number;
}

export interface AudioShieldSettings {
  readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  /** Percentage, inclusive: 0..100. */
  readonly globalStrength: number;
  readonly triggers: readonly TriggerRule[];
  /** Unit interval: 0..1. */
  readonly confidenceThreshold: number;
  /** Unit interval: 0..1. */
  readonly hysteresis: number;
  readonly sitePreferences: Readonly<Record<string, Partial<Pick<AudioShieldSettings, "globalStrength" | "triggers">>>>;
}
