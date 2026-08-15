import { describe, expect, it } from "vitest";
import result from "../bench/results/latest.json";
import manifest from "../bench/fixtures/manifest.json";
describe("benchmark fixtures",()=>{it("has reproducible coverage",()=>{expect(manifest.seed).toBe(7331);expect(manifest.fixtures).toHaveLength(36);expect(manifest.fixtures.filter(f=>f.overlap)).toHaveLength(12);expect(new Set(manifest.fixtures.map(f=>f.class))).toEqual(new Set(["speech","alarm","music","noise"]));});});
describe("separator gate",()=>{it("fails closed and retains measured baseline",()=>{expect(result.metadata.separatorAdapter.available).toBe(false);expect(result.metrics.selective.status).toBe("NOT_RUN");expect(result.metrics.selective.targetAttenuationDb.value).toBeNull();expect(result.metrics.detection.f1).toBeNull();expect(result.metrics.naiveWholeWindowDuck.status).toBe("MEASURED");});});
