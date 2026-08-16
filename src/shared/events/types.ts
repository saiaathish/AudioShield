import type { TriggerId } from "../settings/types";

export interface SensoryEvent {
  readonly triggerId: TriggerId;
  /**
   * Compatibility field: 0..1 sensory routing score. This is not a calibrated
   * semantic-class probability and must not be presented as one in the UI.
   */
  readonly confidence: number;
  readonly timestamp: number;
  readonly tabId: number;
  /** Applied processing command in dB when the route has a dB control. */
  readonly attenuationDb?: number;
  readonly dominantFrequencyHz?: number;
  readonly active?: boolean;
}
