import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("side-panel launch contract", () => {
  it("grants sidePanel and opens the configured panel from the action", () => {
    const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as { permissions: string[]; side_panel: { default_path: string } };
    const worker = readFileSync("src/background/service-worker.ts", "utf8");
    expect(manifest.permissions).toContain("sidePanel");
    expect(manifest.side_panel.default_path).toBe("side-panel.html");
    expect(worker).toContain("chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })");
    expect(worker).not.toContain("openPanelOnActionClick: true");
    expect(worker).toContain(".catch(() => undefined)");
    expect(worker).toContain("chrome.action.onClicked.addListener");
    expect(worker).toContain("chrome.sidePanel.open({ tabId }");
    expect(worker).toContain("startProtectionInternal(tabId)");
    expect(worker).toContain("CAPTURE_EMPTY_STREAM_ID");
    expect(worker).toContain("chromeMessage");
  });
});
