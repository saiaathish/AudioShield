import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeFixedFixture } from "./fixture.mjs";

const root = path.resolve(process.argv[2] ?? process.cwd());
const intakeRoot = path.join(root, "third_party/audioshield_components/semantic_hearing");
const evidenceRoot = path.join(root, "evidence/semantic-hearing");
const fixtureRoot = path.join(evidenceRoot, "fixture");
const source = JSON.parse(await readFile(path.join(intakeRoot, "SOURCE.json"), "utf8"));
const config = JSON.parse(await readFile(path.join(intakeRoot, "extracted/experiments/dc_waveformer/config.json"), "utf8"));
const fixture = await writeFixedFixture(fixtureRoot);

const pythonProbe = String.raw`
import importlib.util, json, pathlib, platform, sys
root = pathlib.Path(sys.argv[1])
names = ["torch", "torchaudio", "speechbrain", "torchmetrics", "scaper", "sofa", "onnx", "onnxruntime"]
modules = {}
versions = {}
for name in names:
    spec = importlib.util.find_spec(name)
    modules[name] = spec is not None
    if spec is not None:
        try:
            mod = __import__(name)
            versions[name] = getattr(mod, "__version__", "unknown")
        except Exception as exc:
            versions[name] = f"import_error:{type(exc).__name__}:{exc}"
source_files = sorted((root / "third_party/audioshield_components/semantic_hearing/extracted").rglob("*.py"))
syntax_errors = []
for filename in source_files:
    try:
        compile(filename.read_text(encoding="utf-8"), str(filename), "exec")
    except Exception as exc:
        syntax_errors.append({"file": str(filename.relative_to(root)), "error": f"{type(exc).__name__}: {exc}"})
print(json.dumps({"python": sys.version.split()[0], "platform": platform.platform(), "modules": modules, "versions": versions, "sourceFileCount": len(source_files), "syntaxErrors": syntax_errors}))
`;
const python = spawnSync(process.env.PYTHON ?? "python3", ["-c", pythonProbe, root], { encoding: "utf8" });
let pythonResult;
try {
  pythonResult = JSON.parse(python.stdout.trim());
} catch {
  pythonResult = { error: python.error?.message ?? (python.stderr.trim() || "python probe did not return JSON") };
}

const checkpointPresent = [".pt", ".pth", ".ckpt", ".safetensors"].some((suffix) => {
  return existsSync(path.join(root, `39${suffix}`)) || existsSync(path.join(evidenceRoot, `39${suffix}`));
});
const onnxWebPresent = existsSync(path.join(root, "node_modules/onnxruntime-web"));
const requiredOriginalModules = ["torch", "torchaudio", "speechbrain", "torchmetrics"];
const missingOriginalModules = requiredOriginalModules.filter((name) => !pythonResult.modules?.[name]);
const originalBlockedReasons = [
  !checkpointPresent ? "license-cleared Semantic Hearing checkpoint is absent; intake marks 39.pt BLOCKED_UNKNOWN and forbids download" : null,
  ...missingOriginalModules.map((name) => `required original-model dependency is absent: ${name}`),
].filter(Boolean);
const exportBlockedReasons = [
  ...originalBlockedReasons,
  !(pythonResult.modules?.onnx) ? "Python onnx exporter is absent" : null,
].filter(Boolean);

const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const report = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  status: "RED",
  verdict: "OFFLINE_REFERENCE",
  lane: "Semantic Hearing separator",
  repo: { head: gitHead, workingTree: "dirty_before_lane_artifacts" },
  intake: {
    componentId: source.component_id,
    upstream: source.repository,
    exactHeadSha: source.exact_head_sha,
    repositoryLicense: source.repository_license,
    checkpoint: source.external_artifacts.find((artifact) => artifact.artifact === "39.pt"),
  },
  modelContract: {
    sampleRateHz: config.train_data_args.sr,
    channels: 2,
    labelCount: config.model_params.label_len,
    modelParams: config.model_params,
    trainingDataset: config.train_data_args.fg_dir,
    browserInput: "UNVERIFIED",
  },
  fixture: {
    ...fixture.fixture,
    files: fixture.files,
    processedOutputWav: "NOT_PRODUCED",
  },
  environment: {
    python: pythonResult,
    onnxRuntimeWebInstalled: onnxWebPresent,
    networkAccessed: false,
  },
  feasibility: {
    sourceSyntax: pythonResult.syntaxErrors?.length ? "FAIL" : "PASS",
    originalUpstreamModel: {
      status: "BLOCKED_NOT_RUN",
      reasons: originalBlockedReasons,
      outputWav: "NOT_PRODUCED",
      qualityMetrics: "NOT_MEASURED",
    },
    onnxExport: {
      status: "BLOCKED_NOT_RUN",
      reasons: exportBlockedReasons,
      unsupportedOperators: "NOT_INSPECTED_WITHOUT_EXPORT",
    },
    onnxRuntimeWeb: {
      status: "NOT_RUN",
      reasons: [
        !onnxWebPresent ? "onnxruntime-web is not installed" : null,
        "no exported ONNX model is available",
      ].filter(Boolean),
      webgpu: "NOT_RUN",
      wasm: "NOT_RUN",
      modelSizeBytes: null,
      initMs: null,
      p50InferenceMs: null,
      p95InferenceMs: null,
    },
    overlapMetrics: {
      targetAttenuationDb: "NOT_MEASURED",
      speechPreservationDb: "NOT_MEASURED",
      globalDuckBaselineDb: "NOT_APPLICABLE_TO_THIS_LANE",
    },
  },
  blockers: [
    "BLOCKED_UNKNOWN checkpoint licensing prevents download, use, or redistribution of 39.pt.",
    ...missingOriginalModules.map((name) => `Missing original/export dependency: ${name}.`),
    "The intake source is trained for binaural environmental recordings; browser stereo/mono preprocessing compatibility is unverified.",
    "The canonical Semantic Hearing labels do not contain dishes or clatter, so the requested target has no evidence-backed conditioning label.",
    "No ONNX export or ONNX Runtime Web execution can be measured without a cleared checkpoint and exporter/runtime graph.",
  ],
  productionWiring: "UNCHANGED",
};

await writeFile(path.join(evidenceRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  "# Semantic Hearing feasibility evidence",
  "",
  `- Status: **${report.status}**` ,
  `- Verdict: **${report.verdict}**`,
  `- Repo HEAD: \`${report.repo.head}\``,
  `- Intake upstream: \`${report.intake.upstream}\` at \`${report.intake.exactHeadSha}\``,
  "- Production wiring: unchanged",
  "",
  "## Fixed fixture",
  "",
  `- ${fixture.fixture.id}: deterministic ${fixture.fixture.sampleRateHz} Hz, ${fixture.fixture.channels}-channel, 1-second speech+dishes overlap fixture.` ,
  "- Input WAVs were generated locally from the fixed recipe; no model output WAV was produced.",
  "",
  "## Feasibility",
  "",
  `- Original upstream model: **${report.feasibility.originalUpstreamModel.status}** — ${originalBlockedReasons.join("; ")}.`,
  `- ONNX export: **${report.feasibility.onnxExport.status}** — ${exportBlockedReasons.join("; ")}.`,
  `- ONNX Runtime Web: **${report.feasibility.onnxRuntimeWeb.status}** — ${report.feasibility.onnxRuntimeWeb.reasons.join("; ")}.`,
  "- WebGPU/WASM latency, model size, target attenuation, speech preservation, and overlap quality: **NOT MEASURED**.",
  "",
  "## Blockers",
  "",
  ...report.blockers.map((blocker) => `- ${blocker}`),
  "",
  "This is an honest offline/reference result. It does not claim selective separation, browser compatibility, speech preservation, or production readiness.",
  "",
].join("\n");
await writeFile(path.join(evidenceRoot, "latest.md"), markdown);
console.log(JSON.stringify({ status: report.status, verdict: report.verdict, head: gitHead, fixture: fixtureRoot, missingOriginalModules, onnxRuntimeWebPresent: onnxWebPresent }, null, 2));
