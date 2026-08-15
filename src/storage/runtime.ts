export type RuntimeAvailability = "available" | "unavailable" | "error";
export interface RuntimeState { readonly bypassed: boolean; readonly activeTabId: number | null; readonly availability: RuntimeAvailability; readonly errorCode: string | null; }
export const createRuntimeState = (): RuntimeState => ({ bypassed: false, activeTabId: null, availability: "available", errorCode: null });
export const setBypass = (state: RuntimeState, bypassed: boolean): RuntimeState => ({ ...state, bypassed });
export const setActiveTab = (state: RuntimeState, activeTabId: number | null): RuntimeState => ({ ...state, activeTabId });
export const setUnavailable = (state: RuntimeState): RuntimeState => ({ ...state, availability: "unavailable", errorCode: null });
export const setRuntimeError = (state: RuntimeState, errorCode: string): RuntimeState => ({ ...state, availability: "error", errorCode, bypassed: true });
