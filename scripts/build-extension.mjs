import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";

const exec = promisify(execFile);

async function bundle(entryPoint, outfile) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile,
    write: false,
  });
  const output = result.outputFiles?.find((file) => file.path.endsWith(".js")) ?? result.outputFiles?.[0];
  if (!output) throw new Error(`esbuild produced no output for ${entryPoint}`);
  await writeFile(outfile, output.contents);
}

await rm("dist", { recursive: true, force: true });
await exec("tsc", ["-p", "tsconfig.json"]);
await mkdir("dist/offscreen", { recursive: true });
await mkdir("dist/ui", { recursive: true });
await mkdir("dist/vendor", { recursive: true });
await cp("manifest.json", "dist/manifest.json");
await cp("src/side-panel.html", "dist/side-panel.html");
await cp("src/offscreen/offscreen.html", "dist/offscreen/offscreen.html");
await cp("src/ui/styles.css", "dist/ui/main.css");

// @sapphi-red/web-noise-suppressor is MIT and packages local AudioWorklet + WASM
// implementations of GTCRN and RNNoise. Keep every runtime asset inside the
// extension package: no remote code, no audio upload, no runtime CDN.
const suppressorRoot = "node_modules/@sapphi-red/web-noise-suppressor/dist";
await cp(`${suppressorRoot}/gtcrn/workletProcessor.js`, "dist/vendor/gtcrn-worklet.js");
await cp(`${suppressorRoot}/gtcrn.wasm`, "dist/vendor/gtcrn.wasm");
await cp(`${suppressorRoot}/rnnoise/workletProcessor.js`, "dist/vendor/rnnoise-worklet.js");
await cp(`${suppressorRoot}/rnnoise.wasm`, "dist/vendor/rnnoise.wasm");
await cp(`${suppressorRoot}/rnnoise_simd.wasm`, "dist/vendor/rnnoise_simd.wasm");

await bundle("src/background.ts", "dist/background.js");
await bundle("src/offscreen/offscreen.ts", "dist/offscreen/offscreen.js");
await bundle("src/ui/main.tsx", "dist/ui/main.js");
