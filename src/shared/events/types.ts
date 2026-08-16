import type { TriggerId } from "../settings/types";

export interface SensoryEvent {
  readonly triggerId: TriggerId;
  readonly confidence: number;
  readonly timestamp: number;
  readonly tabId: number;
  readonly attenuationDb?: number;
  readonly dominantFrequencyHz?: number;
  readonly active?: boolean;
}
