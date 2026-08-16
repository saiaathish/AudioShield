import { describe, expect, it } from "vitest";
import { P0_TRIGGER_IDS } from "../src/shared/settings/types";
import { defaultSettings, loadSettings, migrateSettings, saveSettings, SETTINGS_STORAGE_KEY } from "../src/storage/settings";
import { decideTrigger } from "../src/policy/trigger";
import { createRuntimeState, setRuntimeError, setUnavailable } from "../src/storage/runtime";

describe("shared contracts", () => {
  it("exposes the default sensory trigger IDs", () => {
    expect(P0_TRIGGER_IDS).toEqual([
      "background-noise",
      "alarm-siren",
      "glass-shatter",
      "dishes-clatter",
      "applause",
      "harsh-highs",
      "sudden-loudness",
    ]);
  });

  it("uses one canonical 0-100 strength unit across defaults", () => {
    const settings = defaultSettings();
    expect(settings.schemaVersion).toBe(4);
    expect(settings.globalStrength).toBeGreaterThan(1);
    expect(settings.globalStrength).toBeLessThanOrEqual(100);
    for (const rule of settings.triggers) {
      expect(rule.strength).toBeGreaterThanOrEqual(0);
      expect(rule.strength).toBeLessThanOrEqual(100);
    }
    expect(settings.triggers.some((rule) => rule.id === "glass-shatter")).toBe(true);
  });

  it("migrates v3 unit strengths to v4 percentages without destroying 1% in v4", () => {
    const migrated = migrateSettings({
      schemaVersion: 3,
      globalStrength: 0.65,
      triggers: [{ id: "alarm-siren", enabled: true, strength: 0.82 }],
    });
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.globalStrength).toBe(65);
    expect(migrated.triggers.find((rule) => rule.id === "alarm-siren")?.strength).toBeCloseTo(82, 8);

    const onePercent = migrateSettings({
      schemaVersion: 4,
      globalStrength: 1,
      triggers: [{ id: "alarm-siren", enabled: true, strength: 1 }],
    });
    expect(onePercent.globalStrength).toBe(1);
    expect(onePercent.triggers.find((rule) => rule.id === "alarm-siren")?.strength).toBe(1);
  });

  it("recovers corrupt settings without leaking out-of-range strengths", () => {
    const recovered = migrateSettings({
      schemaVersion: 4,
      globalStrength: "loud",
      triggers: [{ id: "alarm-siren", strength: 400 }],
    });
    expect(recovered.schemaVersion).toBe(4);
    expect(recovered.globalStrength).toBe(defaultSettings().globalStrength);
    expect(recovered.triggers.find((rule) => rule.id === "alarm-siren")?.strength).toBe(100);
  });

  it("migrates and persists no raw audio-shaped data", async () => {
    const writes: Record<string, unknown>[] = [];
    const storage = {
      get: async () => ({ [SETTINGS_STORAGE_KEY]: { schemaVersion: 3, globalStrength: 0.5, triggers: [] } }),
      set: async (value: Record<string, unknown>) => { writes.push(value); },
    };
    const settings = await loadSettings(storage);
    expect(settings.schemaVersion).toBe(4);
    expect(settings.globalStrength).toBe(50);
    await saveSettings(storage, settings);
    expect(JSON.stringify(writes.map((write) => write[SETTINGS_STORAGE_KEY]))).not.toMatch(/waveform|samples|pcm|buffer|rawAudio/i);
  });

  it("composes trigger and master percentages continuously and honors bypass", () => {
    const settings = defaultSettings();
    const alarm = settings.triggers.find((rule) => rule.id === "alarm-siren")!;
    const expected = (alarm.strength / 100) * (settings.globalStrength / 100);
    expect(decideTrigger(settings, "alarm-siren", 0.9).attenuation).toBeCloseTo(expected, 10);
    expect(decideTrigger(settings, "applause", 0.8)).toEqual(decideTrigger(settings, "applause", 0.8));
    expect(decideTrigger(settings, "applause", 0.2).attenuate).toBe(false);
    expect(decideTrigger(settings, "applause", 0.9, true).reason).toBe("bypass");
  });

  it("represents unavailable and error states in memory only", () => {
    const initial = createRuntimeState();
    expect(setUnavailable(initial)).toMatchObject({ availability: "unavailable", errorCode: null });
    expect(setRuntimeError(initial, "MODEL_UNAVAILABLE")).toMatchObject({ availability: "error", errorCode: "MODEL_UNAVAILABLE", bypassed: true });
    expect(JSON.stringify(setRuntimeError(initial, "MODEL_UNAVAILABLE"))).not.toMatch(/waveform|samples|pcm|buffer|rawAudio/i);
  });
});
