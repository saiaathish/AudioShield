import { cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
await rm("dist", { recursive: true, force: true });
await exec("tsc", ["-p", "tsconfig.json"]);
await mkdir("dist/offscreen", { recursive: true });
await cp("manifest.json", "dist/manifest.json");
await cp("src/side-panel.html", "dist/side-panel.html");
await cp("src/offscreen/offscreen.html", "dist/offscreen/offscreen.html");
