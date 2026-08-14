import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("loadable extension artifact", () => {
  it("contains manifest, UI entrypoint, and offscreen document after build", () => {
    expect(existsSync("dist/manifest.json")).toBe(true);
    expect(existsSync("dist/background.js")).toBe(true);
    expect(readFileSync("dist/manifest.json", "utf8")).toContain('"service_worker": "background.js"');
    expect(readFileSync("dist/side-panel.html", "utf8")).toContain('src="./ui/main.js"');
    expect(existsSync("dist/ui/main.js")).toBe(true);
    expect(readFileSync("dist/offscreen/offscreen.html", "utf8")).toContain('src="./offscreen.js"');
    expect(existsSync("dist/offscreen/offscreen.js")).toBe(true);
  });
});
