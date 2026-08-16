import type { SensoryEvent } from "../events/types";
import type { AudioShieldError } from "../errors/types";
import type { TriggerRule } from "../settings/types";

export type SensoryEngineName = "gtcrn" | "rnnoise" | "native-sensory";

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading-models" }
  | { state: "starting"; tabId: number }
  | { state: "capturing"; tabId: number }
  | { state: "protecting"; tabId: number; engine: SensoryEngineName }
  | { state: "unavailable"; tabId: number; code: "SENSORY_ENGINE_UNAVAILABLE"; rawMessage?: string }
  | { state: "bypassed"; tabId: number }
  | { state: "error"; code: string; stage?: string; rawName?: string; rawMessage?: string; chromeMessage?: string; tabId?: number; scheme?: string; host?: string };

export type RuntimeMessage =
  | { type: "PROTECTION_START"; tabId: number }
  | { type: "PROTECTION_STOP"; tabId: number }
  | { type: "BYPASS_SET"; enabled: boolean }
  | { type: "TRIGGER_RULES_SET"; rules: TriggerRule[] }
  | { type: "PROTECTION_RULES_UPDATE"; rules: Pick<TriggerRule, "id" | "enabled" | "strength">[]; masterStrength: number }
  | { type: "ENGINE_STATUS_REQUEST" }
  | { type: "SENSORY_EVENT"; event: SensoryEvent }
  | { type: "ENGINE_STATUS"; status: EngineStatus }
  | { type: "ENGINE_ERROR"; error: AudioShieldError };
