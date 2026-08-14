export interface RuntimeState { readonly bypassed: boolean; readonly activeTabId: number | null; }
export const createRuntimeState = (): RuntimeState => ({ bypassed: false, activeTabId: null });
export const setBypass = (state: RuntimeState, bypassed: boolean): RuntimeState => ({ ...state, bypassed });
export const setActiveTab = (state: RuntimeState, activeTabId: number | null): RuntimeState => ({ ...state, activeTabId });
