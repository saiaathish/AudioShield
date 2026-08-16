import type { AudioShieldSettings, TriggerId } from "../shared/settings/types";

export interface TriggerDecision {
  readonly triggerId: TriggerId;
  readonly attenuate: boolean;
  /** Unit interval after composing trigger and master percentage strengths. */
  readonly attenuation: number;
  readonly reason: "selected-trigger" | "below-threshold" | "bypass" | "unsupported";
}

const percentToUnit = (value: number): number => Math.min(1, Math.max(0, value / 100));

export function decideTrigger(
  settings: AudioShieldSettings,
  triggerId: TriggerId,
  confidence: number,
  bypassed = false,
): TriggerDecision {
  const rule = settings.triggers.find((item) => item.id === triggerId);
  if (bypassed) return { triggerId, attenuate: false, attenuation: 0, reason: "bypass" };
  if (!rule) return { triggerId, attenuate: false, attenuation: 0, reason: "unsupported" };
  if (!rule.enabled || confidence < settings.confidenceThreshold) {
    return { triggerId, attenuate: false, attenuation: 0, reason: "below-threshold" };
  }
  return {
    triggerId,
    attenuate: true,
    attenuation: percentToUnit(rule.strength) * percentToUnit(settings.globalStrength),
    reason: "selected-trigger",
  };
}
