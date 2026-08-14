import type { SensoryEvent } from "../events/types";
import type { AudioShieldError } from "../errors/types";
import type { TriggerRule } from "../settings/types";

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading-models" }
  | { state: "capturing"; tabId: number }
  | { state: "protecting"; tabId: number; engine: "separator" | "duck" }
  | { state: "bypassed"; tabId: number }
  | { state: "error"; code: string };

export type RuntimeMessage =
  | { type: "PROTECTION_START"; tabId: number }
  | { type: "PROTECTION_STOP"; tabId: number }
  | { type: "BYPASS_SET"; enabled: boolean }
  | { type: "TRIGGER_RULES_SET"; rules: TriggerRule[] }
  | { type: "SENSORY_EVENT"; event: SensoryEvent }
  | { type: "ENGINE_STATUS"; status: EngineStatus }
  | { type: "ENGINE_ERROR"; error: AudioShieldError };
