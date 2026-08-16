import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("loadable extension artifact", () => {
  it("contains manifest, UI entrypoint, and offscreen document after build", () => {
    const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as { side_panel: { default_path: string } };
    expect(manifest.side_panel.default_path).toBe("side-panel.html");
    expect(readFileSync("src/offscreen/offscreen.html", "utf8")).toContain('src="./offscreen.js"');
    expect(readFileSync("src/side-panel.html", "utf8")).toContain('href="./ui/main.css"');
    for (const file of ["dist/background.js", "dist/offscreen/offscreen.js", "dist/ui/main.js"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/^\s*import\s/m);
    }
    expect(readdirSync("dist/ui")).toEqual(expect.arrayContaining(["main.js", "main.css"]));
  });
});
