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
await cp("manifest.json", "dist/manifest.json");
await cp("src/side-panel.html", "dist/side-panel.html");
await cp("src/offscreen/offscreen.html", "dist/offscreen/offscreen.html");
await cp("src/ui/styles.css", "dist/ui/main.css");
await bundle("src/background.ts", "dist/background.js");
await bundle("src/offscreen/offscreen.ts", "dist/offscreen/offscreen.js");
await bundle("src/ui/main.tsx", "dist/ui/main.js");
