import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("loadable extension artifact", () => {
  it("contains manifest, UI entrypoint, and offscreen document after build", () => {
    expect(readFileSync("manifest.json", "utf8")).toContain('"service_worker": "background.js"');
    expect(readFileSync("src/side-panel.html", "utf8")).toContain('src="./ui/main.js"');
    expect(readFileSync("src/offscreen/offscreen.html", "utf8")).toContain('src="./offscreen.js"');
    expect(readFileSync("scripts/build-extension.mjs", "utf8")).toContain('"dist/side-panel.html"');
  });
});
