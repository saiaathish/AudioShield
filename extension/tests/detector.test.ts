import { describe, expect, it } from "vitest";
import { LocalSoundDetector } from "../src/ml/detector/detector";
import { MockDetectorInference } from "../src/ml/detector/mock-inference";
import { mapYamnetScores, YamnetDetectorAdapter, YamnetWeightsBlockedError, YAMNET_AUDIO_CONTRACT, YAMNET_MODEL_STATUS } from "../src/ml/detector/yamnet-adapter";

const window = (timestampMs: number) => ({ samples: new Float32Array(4), sampleRate: 16_000, timestampMs });
describe("local sound detector", () => {
  it("normalizes P0 labels and emits timestamped, debounced events", async () => {
    const detector = new LocalSoundDetector(new MockDetectorInference((input) => input.timestampMs < 300 ? [{ label: "Civil Defense Siren", confidence: 0.9 }] : []), { onWindows: 1, offWindows: 2 });
    await detector.initialize(); await detector.process(window(100)); await detector.process(window(200));
    const events = await detector.process(window(300)); const ended = await detector.process(window(400));
    expect(events).toEqual([]); expect(ended[0]).toMatchObject({ classId: "alarm-siren", startedAtMs: 100, endedAtMs: 400, confidence: 0.9 });
  });
  it("recognizes protected speech and reports real measured latency fields", async () => {
    const detector = new LocalSoundDetector(new MockDetectorInference([{ label: "human speech", confidence: 0.8 }]), { onWindows: 1, offWindows: 1 });
    await detector.initialize(); await detector.process(window(10)); const metrics = detector.metrics();
    expect(metrics.windows).toBe(1); expect(metrics.modelLoadMs).toBeGreaterThanOrEqual(0); expect(metrics.inferenceLatencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.p50InferenceLatencyMs).toBeGreaterThanOrEqual(0); expect(metrics.p95InferenceLatencyMs).toBeGreaterThanOrEqual(metrics.p50InferenceLatencyMs);
  });

  it("does not start an event before the on-window hysteresis is satisfied", async () => {
    const detector = new LocalSoundDetector(new MockDetectorInference([{ label: "applause", confidence: 0.9 }]), { onWindows: 2, offWindows: 1 });
    await detector.initialize();
    expect(await detector.process(window(100))).toEqual([]);
    expect(await detector.process(window(200))).toEqual([]);
    const ended = await detector.process({ ...window(300), samples: new Float32Array(0) });
    expect(ended).toEqual([]);
  });
});

describe("YAMNet adapter contract", () => {
  it("maps only supported, verified class-map indices", () => {
    expect(mapYamnetScores([
      { classIndex: 358, confidence: 0.61 },
      { classIndex: 483, confidence: 0.82 },
      { classIndex: 62, confidence: 0.7 },
      { classIndex: 999, confidence: 1 },
      { classIndex: 0, confidence: Number.NaN },
    ])).toEqual([
      { label: "dishes-clatter", confidence: 0.82 },
      { label: "applause", confidence: 0.7 },
    ]);
  });

  it("records the YAMNet input contract without pretending preprocessing or inference ran", () => {
    expect(YAMNET_AUDIO_CONTRACT).toMatchObject({ sampleRateHz: 16_000, channels: 1, patchSamples: 15_360, outputClasses: 521 });
    expect(YAMNET_MODEL_STATUS).toMatchObject({ weightStatus: "BLOCKED_UNKNOWN", weightLicense: "UNKNOWN", weightsBundled: false });
  });

  it("fails closed when the separately hosted weights are not licensed", async () => {
    const adapter = new YamnetDetectorAdapter();
    const detector = new LocalSoundDetector(adapter, { onWindows: 1, offWindows: 1 });
    await expect(detector.initialize()).rejects.toBeInstanceOf(YamnetWeightsBlockedError);
    expect(detector.metrics().windows).toBe(0);
    await expect(detector.process(window(100))).rejects.toThrow("detector is not initialized");
    await expect(adapter.infer(window(100))).rejects.toBeInstanceOf(YamnetWeightsBlockedError);
  });
});
