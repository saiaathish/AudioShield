import type { DetectorInference, AudioWindow, InferenceLabel } from "./types";

export type MockInference = readonly InferenceLabel[] | ((window: AudioWindow) => readonly InferenceLabel[] | Promise<readonly InferenceLabel[]>);
export class MockDetectorInference implements DetectorInference {
  constructor(private readonly result: MockInference) {}
  infer(window: AudioWindow): Promise<readonly InferenceLabel[]> { return Promise.resolve(typeof this.result === "function" ? this.result(window) : this.result); }
}
