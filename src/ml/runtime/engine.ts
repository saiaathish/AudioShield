import type {
  InferenceRequest,
  InferenceResult,
  ModelSource,
  OnnxRuntimeWebApi,
  OnnxRuntimeWebEngine,
  OrtSession,
  OrtTensor,
  RuntimeInfo,
  RuntimeMetrics,
  RuntimeOptions,
  RuntimeProvider,
  RuntimeTensor,
  WebGpuProbe,
} from "./types";

type Cache = Map<string, CacheEntry>;

interface SessionHandle {
  readonly session: OrtSession;
  readonly info: RuntimeInfo;
}

interface CacheEntry {
  readonly key: string;
  readonly promise: Promise<SessionHandle>;
  references: number;
  session?: OrtSession;
}

const caches = new WeakMap<OnnxRuntimeWebApi, Cache>();
const modelObjectIds = new WeakMap<object, number>();
let nextModelObjectId = 1;

const defaultClock = (): number =>
  typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();

function elapsed(start: number, clock: () => number): number {
  return Math.max(0, clock() - start);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function modelKey(model: ModelSource): string {
  if (typeof model === "string") return `url:${model}`;
  const object = model as object;
  let id = modelObjectIds.get(object);
  if (id === undefined) {
    id = nextModelObjectId++;
    modelObjectIds.set(object, id);
  }
  return `bytes:${id}`;
}

function getCache(runtime: OnnxRuntimeWebApi): Cache {
  const existing = caches.get(runtime);
  if (existing) return existing;
  const cache: Cache = new Map();
  caches.set(runtime, cache);
  return cache;
}

async function defaultWebGpuProbe(): Promise<WebGpuProbe> {
  const navigatorValue = (globalThis as { navigator?: { gpu?: { requestAdapter?: () => Promise<unknown> } } }).navigator;
  if (!navigatorValue?.gpu) return { available: false, reason: "WebGPU API is unavailable" };
  if (typeof navigatorValue.gpu.requestAdapter !== "function") {
    return { available: false, reason: "WebGPU adapter probing is unavailable" };
  }
  try {
    const adapter = await navigatorValue.gpu.requestAdapter();
    return adapter ? { available: true } : { available: false, reason: "No WebGPU adapter is available" };
  } catch (error) {
    return { available: false, reason: `WebGPU adapter probe failed: ${errorMessage(error)}` };
  }
}

function configureWasm(runtime: OnnxRuntimeWebApi, options: RuntimeOptions): void {
  const wasm = options.wasm;
  if (!wasm || !runtime.env?.wasm) return;
  if (wasm.numThreads !== undefined) runtime.env.wasm.numThreads = wasm.numThreads;
  if (wasm.proxy !== undefined) runtime.env.wasm.proxy = wasm.proxy;
  if (wasm.wasmPaths !== undefined) runtime.env.wasm.wasmPaths = wasm.wasmPaths;
}

async function releaseSession(session: OrtSession): Promise<void> {
  if (session.release) {
    await session.release();
    return;
  }
  if (session.dispose) await session.dispose();
}

export class OnnxRuntimeInitializationError extends Error {
  constructor(
    message: string,
    readonly causes: Readonly<Record<RuntimeProvider, string | undefined>>,
  ) {
    super(message);
    this.name = "OnnxRuntimeInitializationError";
  }
}

export class OnnxRuntimeWebEngineImpl implements OnnxRuntimeWebEngine {
  private readonly clock: () => number;
  private readonly preferWebGpu: boolean;
  private readonly cacheKey: string;
  private lease?: { readonly cache: Cache; readonly entry: CacheEntry; readonly handle: SessionHandle };
  private initialization?: Promise<RuntimeInfo>;
  private runtimeInfo: RuntimeInfo | null = null;
  private inferenceCount = 0;
  private totalInferenceMs = 0;
  private lastInferenceMs: number | null = null;

  constructor(
    private readonly runtime: OnnxRuntimeWebApi,
    private readonly model: ModelSource,
    private readonly options: RuntimeOptions = {},
  ) {
    this.clock = options.clock ?? defaultClock;
    this.preferWebGpu = options.preferWebGpu ?? true;
    this.cacheKey = `${options.cacheKey ?? modelKey(model)}::${this.preferWebGpu ? "webgpu-first" : "wasm-only"}`;
  }

  async initialize(): Promise<RuntimeInfo> {
    if (this.runtimeInfo) return this.runtimeInfo;
    if (!this.initialization) {
      this.initialization = this.initializeOnce().finally(() => {
        this.initialization = undefined;
      });
    }
    return this.initialization;
  }

  private async initializeOnce(): Promise<RuntimeInfo> {
    const cache = getCache(this.runtime);
    const existing = cache.get(this.cacheKey);
    if (existing) {
      existing.references += 1;
      try {
        const handle = await existing.promise;
        this.lease = { cache, entry: existing, handle };
        this.runtimeInfo = handle.info;
        return handle.info;
      } catch (error) {
        existing.references -= 1;
        throw error;
      }
    }

    const entry: CacheEntry = {
      key: this.cacheKey,
      references: 1,
      promise: this.createSession(),
    };
    cache.set(entry.key, entry);
    try {
      const handle = await entry.promise;
      entry.session = handle.session;
      this.lease = { cache, entry, handle };
      this.runtimeInfo = handle.info;
      return handle.info;
    } catch (error) {
      if (cache.get(entry.key) === entry) cache.delete(entry.key);
      throw error;
    }
  }

  private async createSession(): Promise<SessionHandle> {
    const startedAt = this.clock();
    configureWasm(this.runtime, this.options);
    const probe = this.options.webgpuProbe ?? defaultWebGpuProbe;
    const webgpu: { available: boolean; attempted: boolean; reason?: string } = {
      available: false,
      attempted: false,
    };
    const causes: Record<RuntimeProvider, string | undefined> = { webgpu: undefined, wasm: undefined };
    const attemptedProviders: RuntimeProvider[] = [];

    if (this.preferWebGpu) {
      const probed = await probe();
      webgpu.available = probed.available;
      webgpu.reason = probed.reason;
      if (probed.available) {
        webgpu.attempted = true;
        attemptedProviders.push("webgpu");
        try {
          const session = await this.runtime.InferenceSession.create(this.model, { executionProviders: ["webgpu"] });
          return {
            session,
            info: { provider: "webgpu", initializationMs: elapsed(startedAt, this.clock), attemptedProviders, webgpu },
          };
        } catch (error) {
          causes.webgpu = errorMessage(error);
          webgpu.reason = `WebGPU session initialization failed: ${causes.webgpu}`;
        }
      } else if (!webgpu.reason) {
        webgpu.reason = "WebGPU is unavailable";
      }
    } else {
      webgpu.reason = "WebGPU disabled by configuration";
    }

    attemptedProviders.push("wasm");
    try {
      const session = await this.runtime.InferenceSession.create(this.model, { executionProviders: ["wasm"] });
      return {
        session,
        info: { provider: "wasm", initializationMs: elapsed(startedAt, this.clock), attemptedProviders, webgpu },
      };
    } catch (error) {
      causes.wasm = errorMessage(error);
      throw new OnnxRuntimeInitializationError(
        `ONNX Runtime Web could not initialize WebGPU or WASM: ${causes.webgpu ?? "not attempted"}; ${causes.wasm}`,
        causes,
      );
    }
  }

  async infer(request: InferenceRequest): Promise<InferenceResult> {
    if (!this.lease || !this.runtimeInfo) throw new Error("ONNX Runtime Web engine is not initialized");
    const startedAt = this.clock();
    const feeds: Record<string, OrtTensor> = {};
    for (const [name, tensor] of Object.entries(request.feeds)) {
      feeds[name] = new this.runtime.Tensor(tensor.type, tensor.data, [...tensor.dims]);
    }
    const outputs = await this.lease.handle.session.run(feeds, request.fetches);
    const inferenceMs = elapsed(startedAt, this.clock);
    const typedOutputs: Record<string, RuntimeTensor> = {};
    for (const [name, tensor] of Object.entries(outputs)) {
      typedOutputs[name] = {
        type: tensor.type as RuntimeTensor["type"],
        data: tensor.data,
        dims: [...tensor.dims],
      };
    }
    this.inferenceCount += 1;
    this.totalInferenceMs += inferenceMs;
    this.lastInferenceMs = inferenceMs;
    return { outputs: typedOutputs, provider: this.runtimeInfo.provider, inferenceMs };
  }

  info(): RuntimeInfo | null {
    return this.runtimeInfo;
  }

  metrics(): RuntimeMetrics {
    return {
      provider: this.runtimeInfo?.provider ?? null,
      initializationMs: this.runtimeInfo?.initializationMs ?? null,
      inferenceCount: this.inferenceCount,
      totalInferenceMs: this.totalInferenceMs,
      averageInferenceMs: this.inferenceCount ? this.totalInferenceMs / this.inferenceCount : 0,
      lastInferenceMs: this.lastInferenceMs,
      webgpuAvailable: this.runtimeInfo?.webgpu.available ?? null,
      webgpuUnavailableReason: this.runtimeInfo?.webgpu.reason,
    };
  }

  async dispose(): Promise<void> {
    const lease = this.lease;
    this.lease = undefined;
    this.runtimeInfo = null;
    if (!lease) return;
    lease.entry.references -= 1;
    if (lease.entry.references > 0) return;
    if (lease.cache.get(lease.entry.key) === lease.entry) lease.cache.delete(lease.entry.key);
    if (lease.entry.session) await releaseSession(lease.entry.session);
  }
}

export function createOnnxRuntimeWebEngine(
  runtime: OnnxRuntimeWebApi,
  model: ModelSource,
  options?: RuntimeOptions,
): OnnxRuntimeWebEngineImpl {
  return new OnnxRuntimeWebEngineImpl(runtime, model, options);
}

export async function clearOnnxRuntimeWebSessionCache(runtime: OnnxRuntimeWebApi): Promise<void> {
  const cache = caches.get(runtime);
  if (!cache) return;
  const active = [...cache.values()].filter((entry) => entry.references > 0);
  if (active.length) throw new Error("Cannot clear an active ONNX Runtime Web session cache");
  for (const entry of cache.values()) if (entry.session) await releaseSession(entry.session);
  cache.clear();
}
