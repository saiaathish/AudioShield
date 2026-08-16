import { describe, expect, it, vi } from "vitest";
import { createOnnxRuntimeWebEngine, OnnxRuntimeInitializationError } from "./engine";
import type { OnnxRuntimeWebApi, OrtSession, OrtTensor, RuntimeInfo } from "./types";

function fakeRuntime(create: (provider: "webgpu" | "wasm") => Promise<OrtSession>): OnnxRuntimeWebApi {
  class Tensor implements OrtTensor {
    readonly type: string;
    readonly data: OrtTensor["data"];
    readonly dims: readonly number[];
    constructor(type: OrtTensor["type"], data: OrtTensor["data"], dims: readonly number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }
  return {
    Tensor,
    InferenceSession: {
      create: vi.fn(async (_model, options) => create(options.executionProviders[0])),
    },
    env: { wasm: {} },
  };
}

const input = { feeds: { audio: { type: "float32" as const, data: new Float32Array([1, 2]), dims: [1, 2] } } };

describe("ONNX Runtime Web engine", () => {
  it("initializes WebGPU once, shares the session, and reports inference timing", async () => {
    let now = 0;
    const release = vi.fn();
    const create = vi.fn(async () => ({
      run: vi.fn(async (feeds: Readonly<Record<string, OrtTensor>>) => ({ output: { type: "float32", data: feeds.audio.data, dims: [1, 2] } })),
      release,
    }));
    const runtime = fakeRuntime(async () => create());
    const first = createOnnxRuntimeWebEngine(runtime, "model.onnx", { clock: () => (now += 5), webgpuProbe: () => ({ available: true }) });
    const second = createOnnxRuntimeWebEngine(runtime, "model.onnx", { clock: () => (now += 5), webgpuProbe: () => ({ available: true }) });

    const [firstInfo, secondInfo] = await Promise.all([first.initialize(), second.initialize()]);
    expect(firstInfo.provider).toBe("webgpu");
    expect(secondInfo).toEqual(firstInfo);
    expect(create).toHaveBeenCalledTimes(1);
    const result = await first.infer(input);
    expect(result.provider).toBe("webgpu");
    expect(result.outputs.output.data).toEqual(new Float32Array([1, 2]));
    expect(first.metrics()).toMatchObject({ inferenceCount: 1, initializationMs: 5, lastInferenceMs: 5 });

    await first.dispose();
    expect(release).not.toHaveBeenCalled();
    await second.dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable WebGPU and falls back to WASM", async () => {
    const providers: string[] = [];
    const runtime = fakeRuntime(async (provider) => {
      providers.push(provider);
      return { run: vi.fn(async () => ({})) };
    });
    const engine = createOnnxRuntimeWebEngine(runtime, "fallback.onnx", {
      webgpuProbe: () => ({ available: false, reason: "WebGPU is disabled in this browser" }),
    });

    const info = await engine.initialize();
    expect(info.provider).toBe("wasm");
    expect(info.attemptedProviders).toEqual(["wasm"]);
    expect(info.webgpu).toEqual({ available: false, attempted: false, reason: "WebGPU is disabled in this browser" });
    expect(engine.metrics().webgpuUnavailableReason).toBe("WebGPU is disabled in this browser");
    expect(providers).toEqual(["wasm"]);
    await engine.dispose();
  });

  it("falls back when WebGPU session creation fails and exposes both causes", async () => {
    const runtime = fakeRuntime(async (provider) => {
      if (provider === "webgpu") throw new Error("unsupported operator");
      return { run: vi.fn(async () => ({})) };
    });
    const engine = createOnnxRuntimeWebEngine(runtime, "operator-gap.onnx", { webgpuProbe: () => ({ available: true }) });

    const info = await engine.initialize();
    expect(info.provider).toBe("wasm");
    expect(info.attemptedProviders).toEqual(["webgpu", "wasm"]);
    expect(info.webgpu.attempted).toBe(true);
    expect(info.webgpu.reason).toContain("unsupported operator");
    await engine.dispose();
  });

  it("fails with provider-specific causes when both providers fail and can retry after cleanup", async () => {
    let attempts = 0;
    const runtime = fakeRuntime(async (provider) => {
      attempts += 1;
      throw new Error(`${provider} unavailable`);
    });
    const engine = createOnnxRuntimeWebEngine(runtime, "broken.onnx", { webgpuProbe: () => ({ available: true }) });

    await expect(engine.initialize()).rejects.toBeInstanceOf(OnnxRuntimeInitializationError);
    await expect(engine.initialize()).rejects.toThrow("webgpu unavailable");
    expect(attempts).toBe(4);
    expect(engine.info()).toBeNull();
  });

  it("configures WASM and rejects inference before initialization", async () => {
    const runtime = fakeRuntime(async () => ({ run: vi.fn(async () => ({})) }));
    const engine = createOnnxRuntimeWebEngine(runtime, "wasm.onnx", {
      preferWebGpu: false,
      wasm: { numThreads: 2, proxy: true, wasmPaths: "/extension/wasm/" },
    });

    await expect(engine.infer(input)).rejects.toThrow("not initialized");
    await engine.initialize();
    expect(runtime.env?.wasm).toEqual({ numThreads: 2, proxy: true, wasmPaths: "/extension/wasm/" });
    await engine.dispose();
  });
});
