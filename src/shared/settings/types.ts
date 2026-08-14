export const P0_TRIGGER_IDS = ["alarm-siren", "dishes-clatter", "applause"] as const;
export type TriggerId = (typeof P0_TRIGGER_IDS)[number];

export interface TriggerRule { readonly id: TriggerId; readonly enabled: boolean; readonly strength: number; }
export interface AudioShieldSettings { readonly globalStrength: number; readonly triggers: readonly TriggerRule[]; }
