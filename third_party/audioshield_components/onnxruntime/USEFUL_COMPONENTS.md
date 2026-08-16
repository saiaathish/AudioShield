# ONNX Runtime Web intake

Scope: browser-local ONNX inference patterns for AudioShield. This folder is
an intake/reference surface only. It does not add `onnxruntime-web` to the
AudioShield build and does not vendor the runtime.

## Upstream verification

| Source | Exact HEAD | Branch | Repository license | Verification |
| --- | --- | --- | --- | --- |
| [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | `e858164c9fbdb61d5d0be980d6a2a0c161db3584` | `main` | MIT | Root `LICENSE` inspected in the temporary clone |
| [microsoft/onnxruntime-inference-examples](https://github.com/microsoft/onnxruntime-inference-examples) | `978efc89bdfb43aec001677d9344355e896c9ca0` | `main` | MIT | Root `LICENSE` inspected in the temporary clone |

The copied code and documentation retain their upstream copyright/license
headers where present. The supplemental repository license is retained at
`extracted/onnxruntime-inference-examples/LICENSE`.

## Curated files

The `extracted/` tree contains only the small files listed in `SOURCE.json`:

- `onnxruntime/js/web/README.md`: browser runtime role, compatibility table,
  WebAssembly/WebGPU status, and operator-support warning.
- `onnxruntime/js/web/package.json`: inspected official package metadata and
  entry points; it is reference material, not a dependency declaration for
  AudioShield.
- `onnxruntime-inference-examples/js/api-usage_ort-env-flags/README.md`:
  `ort.env.wasm.numThreads`, `ort.env.wasm.proxy`, `ort.env.wasm.wasmPaths`,
  and WebGPU environment examples.
- `onnxruntime-inference-examples/js/api-usage_session-options/README.md`:
  per-session `executionProviders` examples for `wasm`, `webgl`, and
  `webgpu`, including the first-available provider-list pattern.
- `onnxruntime-inference-examples/js/api-usage_inference-session/*`: model
  loading, `Tensor` construction, named feeds, and `session.run()` patterns.
- `onnxruntime-inference-examples/js/quick-start_onnxruntime-web-bundler/*`:
  minimal browser inference and a bundler configuration that copies the
  package's WASM assets into the output.

## Recommended AudioShield adaptation

Use the official npm package as a normal build dependency when implementation
is authorized. Do not copy the runtime source tree into the extension.

Suggested adapter shape:

```text
AudioWorklet/offscreen audio frames
  -> model-specific preprocessing
  -> ort.Tensor('float32', typedArray, modelShape)
  -> InferenceSession.run({ inputName: tensor })
  -> model-specific postprocessing
  -> DSP/recombination
```

The examples prove the API shape, not AudioShield's audio model shape or
real-time suitability. Feed names, dimensions, sample rate, chunk length, and
output interpretation must come from the selected detector/separator model.

## Provider and worker decisions

- `wasm` is the conservative CPU fallback. The upstream compatibility table
  lists WebAssembly support across the listed Chrome, Edge, Safari, Firefox,
  and Node environments.
- `webgpu` is available in the upstream table for Chrome/Edge on supported
  desktop/mobile configurations, but the upstream README labels the backend
  experimental and points to an operator support table. AudioShield must gate
  WebGPU by feature detection and model-operator compatibility.
- The inspected `session-options.ts` accepts provider entries such as
  `webgpu` and supports options including `preferredLayout`, custom device,
  CPU-node fallback names, validation mode, and buffer-cache modes. These are
  configuration references, not a promise that every model benefits from
  them.
- The inspected `ort.env` example says `numThreads` may fall back to one
  thread when browser threading is unavailable. It also shows `proxy = true`
  for asynchronous WASM inference in a web worker.
- The inspected proxy implementation transfers CPU tensor buffers. It rejects
  GPU-resident inputs and preallocated outputs in proxy mode. Therefore a
  proxy-worker design must use CPU tensors at that boundary; do not assume it
  can carry WebGPU tensors through the worker.
- Configure `wasmPaths` to extension-local packaged assets. The CDN path shown
  by the script-tag example was inspected but intentionally not copied because
  MV3 intake should not depend on remote runtime code or remote WASM.

## Packaging pattern

The copied webpack example uses `copy-webpack-plugin` to copy
`node_modules/onnxruntime-web/dist/*.wasm` into the browser output. For an MV3
build, adapt this to the repository's existing bundler/output contract and
verify that every referenced WASM asset is present in the loaded extension
package. This intake does not modify that production contract.

## Model/operator boundary

No ONNX model or checkpoint was copied. The three selected inference examples
contain `model.onnx` files, but their artifacts do not carry an explicit,
separately verifiable model license in the inspected repository paths. They are
therefore recorded as `BLOCKED_UNKNOWN` in `SOURCE.json` and must not be
redistributed from this intake.

The runtime README states broad WebAssembly operator coverage and separately
identifies WebGPU as experimental with a generated operator table. A future
AudioShield model must be checked against that table and tested on the actual
Chrome target; source-code compatibility alone is insufficient.

## What this does not prove

- It does not prove that any AudioShield detector or separator exports to ONNX.
- It does not prove that a separator meets AudioWorklet deadlines or works on
  overlapping tab audio.
- It does not prove Chrome MV3 offscreen lifecycle, tab capture, or playback
  routing; those belong to the Chrome sample intake.
- It does not provide a licensed AudioShield model weight.
