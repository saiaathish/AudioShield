# Semantic Hearing feasibility evidence

- Status: **RED**
- Verdict: **OFFLINE_REFERENCE**
- Repo HEAD: `353b4105e30de9079fba8ce65acb1c7c848622d8`
- Intake upstream: `https://github.com/vb000/SemanticHearing` at `07e9786c7a741f0a7c722dcde66a2679ca068c50`
- Production wiring: unchanged

## Fixed fixture

- semantic-hearing-speech-dishes-v1: deterministic 44100 Hz, 2-channel, 1-second speech+dishes overlap fixture.
- Input WAVs were generated locally from the fixed recipe; no model output WAV was produced.

## Feasibility

- Original upstream model: **BLOCKED_NOT_RUN** — license-cleared Semantic Hearing checkpoint is absent; intake marks 39.pt BLOCKED_UNKNOWN and forbids download; required original-model dependency is absent: torchaudio; required original-model dependency is absent: speechbrain; required original-model dependency is absent: torchmetrics.
- ONNX export: **BLOCKED_NOT_RUN** — license-cleared Semantic Hearing checkpoint is absent; intake marks 39.pt BLOCKED_UNKNOWN and forbids download; required original-model dependency is absent: torchaudio; required original-model dependency is absent: speechbrain; required original-model dependency is absent: torchmetrics; Python onnx exporter is absent.
- ONNX Runtime Web: **NOT_RUN** — onnxruntime-web is not installed; no exported ONNX model is available.
- WebGPU/WASM latency, model size, target attenuation, speech preservation, and overlap quality: **NOT MEASURED**.

## Blockers

- BLOCKED_UNKNOWN checkpoint licensing prevents download, use, or redistribution of 39.pt.
- Missing original/export dependency: torchaudio.
- Missing original/export dependency: speechbrain.
- Missing original/export dependency: torchmetrics.
- The intake source is trained for binaural environmental recordings; browser stereo/mono preprocessing compatibility is unverified.
- The canonical Semantic Hearing labels do not contain dishes or clatter, so the requested target has no evidence-backed conditioning label.
- No ONNX export or ONNX Runtime Web execution can be measured without a cleared checkpoint and exporter/runtime graph.

This is an honest offline/reference result. It does not claim selective separation, browser compatibility, speech preservation, or production readiness.
