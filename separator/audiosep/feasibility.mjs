import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const AUDIOSEP_SOURCE = "third_party/audioshield_components/audiosep";
const SOURCE_MANIFEST = join(AUDIOSEP_SOURCE, "SOURCE.json");
const FIXTURE_ROOT = "separator/audiosep/fixtures/speech-dishes";
const CACHE_ROOT = "separator/audiosep/cache";
const FIXED_QUERY = "a sound of dishes";
const FIXED_ENCODER = "AudioSep-CLAP/HTSAT-base+roberta-base";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function embeddingCacheKey(query, encoder = FIXED_ENCODER) {
  return sha256(JSON.stringify({ encoder, query }));
}

export function validateCachedEmbedding(value, expected = {}) {
  const dimension = expected.dimension ?? 512;
  if (!value || value.schemaVersion !== 1) return { valid: false, reason: "schema-version" };
  if (value.encoder !== (expected.encoder ?? FIXED_ENCODER)) return { valid: false, reason: "encoder-mismatch" };
  if (value.query !== expected.query) return { valid: false, reason: "query-mismatch" };
  if (value.dimension !== dimension || !Array.isArray(value.embedding) || value.embedding.length !== dimension) {
    return { valid: false, reason: "dimension" };
  }
  if (!value.embedding.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return { valid: false, reason: "non-finite-value" };
  }
  return { valid: true, reason: "validated-cache-contract" };
}

function walk(root, ignored = new Set([".git", "node_modules", "dist"])) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, ignored));
    else files.push(path);
  }
  return files;
}

function sourceHashes(root, manifest) {
  return manifest.useful_files.map((item) => {
    const path = join(root, AUDIOSEP_SOURCE, item.local_path);
    const present = existsSync(path);
    const actualSha1 = present ? createHash("sha1").update(readFileSync(path)).digest("hex") : null;
    return {
      path: relative(root, path),
      expectedSha1: item.source_blob_sha1,
      actualSha1,
      status: actualSha1 === item.source_blob_sha1 ? "MATCH" : present ? "MISMATCH" : "MISSING",
    };
  });
}

function artifactInventory(root) {
  const files = walk(root);
  const names = files.map((path) => relative(root, path));
  const extensions = [".ckpt", ".pt", ".pth", ".bin", ".onnx", ".safetensors"];
  return names.filter((path) => extensions.some((extension) => path.toLowerCase().endsWith(extension)));
}

function fixtureAudit(root) {
  const fixturePaths = ["speech.wav", "dishes.wav", "mixture.wav"].map((name) => join(root, FIXTURE_ROOT, name));
  const manifestPath = join(root, "bench/fixtures/manifest.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const hasDishesManifestEntry = Boolean(manifest?.fixtures?.some((fixture) => fixture.class === "dishes"));
  const existing = fixturePaths.filter(existsSync).map((path) => relative(root, path));
  return {
    id: "speech+dishes-fixed",
    status: existing.length === fixturePaths.length ? "AVAILABLE" : "BLOCKED",
    requiredFiles: fixturePaths.map((path) => relative(root, path)),
    presentFiles: existing,
    existingBenchManifestHasDishes: hasDishesManifestEntry,
    existingHybridOutputsAreFixtures: false,
    reason: existing.length === fixturePaths.length
      ? "fixed speech/dishes stems and mixture are present"
      : "no fixed speech+dishes stem fixture is present; existing hybrid WAVs are output-only synthetic artifacts",
  };
}

function cacheAudit(root) {
  const cachePath = join(root, CACHE_ROOT, `${embeddingCacheKey(FIXED_QUERY)}.json`);
  const present = existsSync(cachePath);
  let validation = null;
  if (present) {
    try {
      validation = validateCachedEmbedding(readJson(cachePath), { query: FIXED_QUERY });
    } catch {
      validation = { valid: false, reason: "invalid-json" };
    }
  }
  return {
    status: present && validation?.valid ? "AVAILABLE" : "BLOCKED_NO_CACHE",
    query: FIXED_QUERY,
    encoder: FIXED_ENCODER,
    dimension: 512,
    key: embeddingCacheKey(FIXED_QUERY),
    expectedPath: relative(root, cachePath),
    present,
    validation,
    execution: "NOT_RUN",
    reason: present && validation?.valid
      ? "cache contract is valid; model execution still requires the matching local separator checkpoint"
      : "no cached 512-value CLAP text embedding is present; no embedding was generated or downloaded",
  };
}

function productionReferences(root) {
  return walk(join(root, "src"), new Set([".git", "node_modules", "dist"]))
    .concat(walk(join(root, "extension"), new Set([".git", "node_modules", "dist"])))
    .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
    .filter((path) => readFileSync(path, "utf8").toLowerCase().includes("audiosep"))
    .map((path) => relative(root, path));
}

export function inspectAudioSep(root = process.cwd(), generatedAt = new Date().toISOString()) {
  const repoRoot = resolve(root);
  const source = readJson(join(repoRoot, SOURCE_MANIFEST));
  const hashes = sourceHashes(repoRoot, source);
  const artifacts = artifactInventory(repoRoot);
  const fixture = fixtureAudit(repoRoot);
  const cache = cacheAudit(repoRoot);
  const production = productionReferences(repoRoot);
  const checkpointWeights = source.model_weights.map((weight) => ({
    name: weight.name,
    status: weight.status,
    license: weight.license,
    presentInCheckout: artifacts.some((path) => path.includes(weight.name.includes("CLAP") ? "music_speech_audioset" : "audiosep")),
    downloadAttempted: false,
  }));
  const blockedWeightRefs = checkpointWeights.filter((weight) => weight.status === "BLOCKED_UNKNOWN");
  const sourceIntegrity = hashes.every((item) => item.status === "MATCH");
  const prerequisites = {
    sourceIntegrity: sourceIntegrity ? "PASS" : "BLOCKED",
    separatorCheckpoint: checkpointWeights.some((weight) => weight.name.includes("AudioSep base") && weight.presentInCheckout) ? "AVAILABLE" : "MISSING",
    clapCheckpoint: checkpointWeights.some((weight) => weight.name.includes("CLAP") && weight.presentInCheckout) ? "AVAILABLE" : "MISSING",
    robertaTokenizerCache: existsSync(join(repoRoot, ".cache/huggingface/hub")) ? "PRESENT_UNVERIFIED" : "MISSING",
    vendoredClapSource: existsSync(join(repoRoot, AUDIOSEP_SOURCE, "extracted/models/CLAP")) ? "AVAILABLE" : "MISSING",
    onnxExport: artifacts.some((path) => path.toLowerCase().endsWith(".onnx")) ? "PRESENT_UNVERIFIED" : "MISSING",
    realSpeechDishesFixture: fixture.status === "AVAILABLE" ? "AVAILABLE" : "MISSING",
  };
  const blockers = [];
  if (blockedWeightRefs.length) blockers.push("upstream convenience checkpoint references are BLOCKED_UNKNOWN; no blocked weights were downloaded");
  if (prerequisites.separatorCheckpoint === "MISSING") blockers.push("licensed AudioSep separator checkpoint is not copied into the checkout");
  if (prerequisites.clapCheckpoint === "MISSING") blockers.push("licensed CLAP checkpoint is not copied into the checkout");
  if (prerequisites.vendoredClapSource === "MISSING") blockers.push("AudioSep source imports models.CLAP, but that transitive source tree is not in the intake");
  if (prerequisites.robertaTokenizerCache === "MISSING") blockers.push("roberta-base tokenizer cache is absent; generating it would require external model material");
  if (prerequisites.onnxExport === "MISSING") blockers.push("no ONNX export or operator-compatibility evidence exists");
  if (fixture.status !== "AVAILABLE") blockers.push("fixed real speech+dishes stems/mixture are absent");
  if (cache.status !== "AVAILABLE") blockers.push("no cached 512-value CLAP embedding exists for the fixed dishes query");
  if (production.length) blockers.push(`production wiring references AudioSep outside this lane: ${production.join(", ")}`);
  return {
    schemaVersion: 1,
    lane: "audiosep-separator",
    generatedAt,
    repo: { root: repoRoot, head: "353b4105e30de9079fba8ce65acb1c7c848622d8", productionWiringReferences: production },
    scope: { sourceOnly: true, downloadsAttempted: false, blockedWeightsDownloaded: false, productionWiringChanged: false },
    intake: {
      source: AUDIOSEP_SOURCE,
      upstreamRepository: source.repository,
      upstreamCommit: source.commit,
      sourceLicense: source.license,
      sourceLicenseVerified: source.license_verified,
      sourceIntegrity: hashes,
      weights: checkpointWeights,
      blockedWeightReferences: blockedWeightRefs.map((weight) => weight.name),
    },
    fixedFixture: fixture,
    cachedEmbedding: cache,
    offlineOracle: {
      status: Object.values(prerequisites).every((status) => status === "PASS" || status === "AVAILABLE") ? "READY_TO_ATTEMPT" : "BLOCKED",
      prerequisites,
      processedPcm: "NOT_RUN",
      metrics: null,
      reason: "AudioSep cannot be executed from intake source alone without its external model/tokenizer artifacts and a real fixed overlap fixture",
    },
    verdict: blockers.length === 0 ? "GREEN" : "RED",
    blockers,
    limits: [
      "This lane does not claim browser export, ONNX Runtime Web compatibility, real-time latency, or selective attenuation.",
      "Existing hybrid-dsp WAVs are not used as AudioSep inputs or separation evidence.",
      "No model weights, tokenizer files, evaluation data, or processed separation output were downloaded or fabricated.",
    ],
  };
}

export function renderMarkdown(report) {
  const p = report.offlineOracle.prerequisites;
  const lines = [
    "# AudioSep separator feasibility",
    "",
    `- Verdict: **${report.verdict}**`,
    `- Upstream: \`${report.intake.upstreamRepository}@${report.intake.upstreamCommit}\``,
    `- Source license: **${report.intake.sourceLicense} / verified=${report.intake.sourceLicenseVerified}**`,
    `- Downloads attempted: **${report.scope.downloadsAttempted}**`,
    "",
    "## Measured intake facts",
    "",
    `- Source-file integrity: **${report.intake.sourceIntegrity.every((item) => item.status === "MATCH") ? "PASS" : "BLOCKED"}** (${report.intake.sourceIntegrity.length} useful files checked).`,
    `- Fixed fixture \`${report.fixedFixture.id}\`: **${report.fixedFixture.status}**; bench manifest has dishes entry: **${report.fixedFixture.existingBenchManifestHasDishes}**.`,
    `- Cached embedding for \`${report.cachedEmbedding.query}\`: **${report.cachedEmbedding.status}**; expected dimension **${report.cachedEmbedding.dimension}**; execution **${report.cachedEmbedding.execution}**.`,
    "",
    "## Oracle readiness",
    "",
    "| Prerequisite | Status |",
    "|---|---|",
    ...Object.entries(p).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    `Processed PCM: **${report.offlineOracle.processedPcm}**; metrics: **${report.offlineOracle.metrics === null ? "null" : "present"}**.`,
    "",
    "## Blockers",
    "",
    ...report.blockers.map((blocker) => `- ${blocker}`),
    "",
    "No production wiring was changed. No weights, tokenizer artifacts, evaluation data, or processed output were downloaded or fabricated.",
    "",
  ];
  return lines.join("\n");
}

function main() {
  const rootArgIndex = process.argv.indexOf("--root");
  const root = rootArgIndex >= 0 ? process.argv[rootArgIndex + 1] : process.cwd();
  const report = inspectAudioSep(root);
  if (process.argv.includes("--write-evidence")) {
    const jsonPath = join(root, "evidence/separator/audiosep-feasibility.json");
    const markdownPath = join(root, "evidence/separator/audiosep-feasibility.md");
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownPath, renderMarkdown(report));
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
