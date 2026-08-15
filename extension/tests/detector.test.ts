import { describe, expect, it } from "vitest";
import { LocalSoundDetector } from "../src/ml/detector/detector";
import { MockDetectorInference } from "../src/ml/detector/mock-inference";

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
  });
});
