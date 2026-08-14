import { describe, expect, it } from "vitest";
import { P0_TRIGGER_IDS } from "../src/shared/settings/types";
import { defaultSettings, loadSettings, migrateSettings, saveSettings, SETTINGS_STORAGE_KEY } from "../src/storage/settings";
import { decideTrigger } from "../src/policy/trigger";

describe("shared contracts", () => {
  it("exposes the default P0 trigger IDs", () => { expect(P0_TRIGGER_IDS).toEqual(["alarm-siren", "dishes-clatter", "applause"]); });
  it("recovers corrupt settings", () => { const recovered = migrateSettings({ globalStrength: "loud", triggers: [{ id: "alarm-siren", strength: 4 }] }); expect(recovered.schemaVersion).toBe(2); expect(recovered.globalStrength).toBe(defaultSettings().globalStrength); expect(recovered.triggers[0].strength).toBe(1); });
  it("migrates and persists no raw audio-shaped data", async () => { const writes: Record<string, unknown>[] = []; const storage = { get: async () => ({ [SETTINGS_STORAGE_KEY]: { globalStrength: 0.5, triggers: [] } }), set: async (v: Record<string, unknown>) => { writes.push(v); } }; const settings = await loadSettings(storage); expect(settings.schemaVersion).toBe(2); await saveSettings(storage, settings); expect(JSON.stringify(writes.map((write) => write[SETTINGS_STORAGE_KEY]))).not.toMatch(/waveform|samples|pcm|buffer|rawAudio/i); });
  it("produces deterministic policy and honors bypass", () => { const s = defaultSettings(); expect(decideTrigger(s, "applause", 0.8)).toEqual(decideTrigger(s, "applause", 0.8)); expect(decideTrigger(s, "applause", 0.2).attenuate).toBe(false); expect(decideTrigger(s, "applause", 0.9, true).reason).toBe("bypass"); });
});
