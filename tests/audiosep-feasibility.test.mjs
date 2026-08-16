import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { embeddingCacheKey, inspectAudioSep, validateCachedEmbedding } from "../separator/audiosep/feasibility.mjs";

describe("AudioSep separator lane", () => {
  it("fails closed on the checked-out intake without downloading artifacts", () => {
    const report = inspectAudioSep(process.cwd(), "2026-08-16T00:00:00.000Z");
    expect(report.verdict).toBe("RED");
    expect(report.scope.downloadsAttempted).toBe(false);
    expect(report.scope.blockedWeightsDownloaded).toBe(false);
    expect(report.offlineOracle.status).toBe("BLOCKED");
    expect(report.offlineOracle.processedPcm).toBe("NOT_RUN");
    expect(report.offlineOracle.metrics).toBeNull();
    expect(report.fixedFixture.status).toBe("BLOCKED");
    expect(report.cachedEmbedding.status).toBe("BLOCKED_NO_CACHE");
    expect(report.repo.productionWiringReferences).toEqual([]);
  });

  it("validates the fixed-query 512-value cache contract without asserting model quality", () => {
    const query = "a sound of dishes";
    const value = {
      schemaVersion: 1,
      encoder: "AudioSep-CLAP/HTSAT-base+roberta-base",
      query,
      dimension: 512,
      embedding: Array.from({ length: 512 }, (_, index) => index / 512),
    };
    expect(embeddingCacheKey(query)).toMatch(/^[a-f0-9]{64}$/);
    expect(validateCachedEmbedding(value, { query })).toEqual({ valid: true, reason: "validated-cache-contract" });
    expect(validateCachedEmbedding({ ...value, embedding: value.embedding.slice(0, 511) }, { query }).valid).toBe(false);
  });

  it("accepts a valid cache file only at the deterministic key path", () => {
    const root = mkdtempSync(join(tmpdir(), "audioshield-audiosep-"));
    mkdirSync(join(root, "third_party/audioshield_components/audiosep"), { recursive: true });
    writeFileSync(join(root, "third_party/audioshield_components/audiosep/SOURCE.json"), JSON.stringify({
      repository: "fixture",
      commit: "fixture",
      license: "MIT",
      license_verified: true,
      model_weights: [],
      useful_files: [],
    }));
    const cacheDir = join(root, "separator/audiosep/cache");
    mkdirSync(cacheDir, { recursive: true });
    const query = "a sound of dishes";
    writeFileSync(join(cacheDir, `${embeddingCacheKey(query)}.json`), JSON.stringify({
      schemaVersion: 1,
      encoder: "AudioSep-CLAP/HTSAT-base+roberta-base",
      query,
      dimension: 512,
      embedding: Array(512).fill(0),
    }));
    const report = inspectAudioSep(root, "2026-08-16T00:00:00.000Z");
    expect(report.cachedEmbedding.status).toBe("AVAILABLE");
    expect(report.cachedEmbedding.validation.valid).toBe(true);
    expect(report.cachedEmbedding.execution).toBe("NOT_RUN");
  });
});
