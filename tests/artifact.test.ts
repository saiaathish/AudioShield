import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("loadable extension artifact", () => {
  it("contains the complete local AudioWorklet sensory engine after build", () => {
    const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8")) as {
      side_panel: { default_path: string };
      content_security_policy?: { extension_pages?: string };
    };
    expect(manifest.side_panel.default_path).toBe("side-panel.html");
    expect(manifest.content_security_policy?.extension_pages).toContain("wasm-unsafe-eval");
    expect(readFileSync("src/offscreen/offscreen.html", "utf8")).toContain('src="./offscreen.js"');
    expect(readFileSync("src/side-panel.html", "utf8")).toContain('href="./ui/main.css"');

    for (const file of ["dist/background.js", "dist/offscreen/offscreen.js", "dist/ui/main.js"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/^\s*import\s/m);
    }

    const offscreen = readFileSync("dist/offscreen/offscreen.js", "utf8");
    expect(offscreen).not.toContain("createScriptProcessor");
    expect(offscreen).not.toContain("ScriptProcessorNode");
    expect(offscreen).toContain("AudioWorklet");

    for (const asset of [
      "dist/vendor/gtcrn-worklet.js",
      "dist/vendor/gtcrn.wasm",
      "dist/vendor/rnnoise-worklet.js",
      "dist/vendor/rnnoise.wasm",
      "dist/vendor/rnnoise_simd.wasm",
    ]) {
      expect(statSync(asset).size).toBeGreaterThan(100);
    }

    expect(readdirSync("dist/ui")).toEqual(expect.arrayContaining(["main.js", "main.css"]));
  });
});
