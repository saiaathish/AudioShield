import { cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";

const exec = promisify(execFile);
await rm("dist", { recursive: true, force: true });
await exec("tsc", ["-p", "tsconfig.json"]);
await mkdir("dist/offscreen", { recursive: true });
await mkdir("dist/ui", { recursive: true });
await cp("manifest.json", "dist/manifest.json");
await cp("src/side-panel.html", "dist/side-panel.html");
await cp("src/offscreen/offscreen.html", "dist/offscreen/offscreen.html");
await cp("src/ui/styles.css", "dist/ui/main.css");
await build({ entryPoints: ["src/background.ts"], bundle: true, format: "esm", platform: "browser", target: "es2022", outfile: "dist/background.js" });
await build({ entryPoints: ["src/offscreen/offscreen.ts"], bundle: true, format: "esm", platform: "browser", target: "es2022", outfile: "dist/offscreen/offscreen.js" });
await build({ entryPoints: ["src/ui/main.tsx"], bundle: true, format: "esm", platform: "browser", target: "es2022", outfile: "dist/ui/main.js" });
