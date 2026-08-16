export type TensorData =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | readonly string[];

export type TensorType =
  | "float32"
  | "float64"
  | "int8"
  | "int16"
  | "int32"
  | "uint8"
  | "uint16"
  | "uint32"
  | "bool"
  | "string"
  | "int64"
  | "uint64";

export interface RuntimeTensor {
  readonly type: TensorType;
  readonly data: TensorData;
  readonly dims: readonly number[];
}

export type ModelSource = string | ArrayBuffer | Uint8Array;

export interface InferenceRequest {
  readonly feeds: Readonly<Record<string, RuntimeTensor>>;
  readonly fetches?: readonly string[];
}

export interface InferenceResult {
  readonly outputs: Readonly<Record<string, RuntimeTensor>>;
  readonly provider: RuntimeProvider;
  readonly inferenceMs: number;
}

export type RuntimeProvider = "webgpu" | "wasm";

export interface WebGpuProbe {
  readonly available: boolean;
  readonly reason?: string;
}

export interface RuntimeInfo {
  readonly provider: RuntimeProvider;
  readonly initializationMs: number;
  readonly attemptedProviders: readonly RuntimeProvider[];
  readonly webgpu: {
    readonly available: boolean;
    readonly attempted: boolean;
    readonly reason?: string;
  };
}

export interface RuntimeMetrics {
  readonly provider: RuntimeProvider | null;
  readonly initializationMs: number | null;
  readonly inferenceCount: number;
  readonly totalInferenceMs: number;
  readonly averageInferenceMs: number;
  readonly lastInferenceMs: number | null;
  readonly webgpuAvailable: boolean | null;
  readonly webgpuUnavailableReason?: string;
}

export interface RuntimeWasmOptions {
  readonly numThreads?: number;
  readonly proxy?: boolean;
  readonly wasmPaths?: string | Readonly<Record<string, string>>;
}

export interface RuntimeOptions {
  /** A stable key is recommended when the model is supplied as bytes. */
  readonly cacheKey?: string;
  readonly preferWebGpu?: boolean;
  readonly wasm?: RuntimeWasmOptions;
  readonly webgpuProbe?: () => WebGpuProbe | Promise<WebGpuProbe>;
  readonly clock?: () => number;
}

export interface OrtTensor {
  readonly type: string;
  readonly data: TensorData;
  readonly dims: readonly number[];
}

export interface OrtSession {
  run(feeds: Readonly<Record<string, OrtTensor>>, fetches?: readonly string[]): Promise<Readonly<Record<string, OrtTensor>>>;
  release?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export interface OrtSessionOptions {
  readonly executionProviders: readonly [RuntimeProvider];
}

export interface OnnxRuntimeWebApi {
  readonly Tensor: new (type: TensorType, data: TensorData, dims: readonly number[]) => OrtTensor;
  readonly InferenceSession: {
    create(model: ModelSource, options: OrtSessionOptions): Promise<OrtSession>;
  };
  readonly env?: {
    readonly wasm?: {
      numThreads?: number;
      proxy?: boolean;
      wasmPaths?: string | Readonly<Record<string, string>>;
    };
  };
}

export interface OnnxRuntimeWebEngine {
  initialize(): Promise<RuntimeInfo>;
  infer(request: InferenceRequest): Promise<InferenceResult>;
  info(): RuntimeInfo | null;
  metrics(): RuntimeMetrics;
  dispose(): Promise<void>;
}
