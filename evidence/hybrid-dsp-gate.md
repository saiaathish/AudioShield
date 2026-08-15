# P0-A lane C — hybrid target detection / source estimate

## Verdict: YELLOW

GREEN for deterministic offline DSP behavior and artifact production. YELLOW overall because this is not a neural separator and has no browser real-time proof.

Command: `node model-tools/validate/hybrid-benchmark.mjs`

Evidence generated in the same run:

- 15 deterministic speech+dishes mixtures, 16 kHz, 1 second each.
- Actual processed PCM WAV files: `bench/results/hybrid-wav/speech-dishes-01.wav` through `-15.wav`.
- JSON: `bench/results/hybrid-latest.json` and `evidence/hybrid-dsp-latest.json`.
- DSP method: rectangular short-time DFT; high-band transient target mask; inverse correction. No ONNX, neural checkpoint, learned source separator, or preprocessed artifact.

Measured run:

| metric | p50 | p95 |
| --- | ---: | ---: |
| hybrid target residual attenuation | 13.291 dB | 13.679 dB |
| hybrid speech loss | -0.049 dB | -0.024 dB |
| processing latency | 52.168 ms | 55.413 ms |

Naive whole-window duck uses the same mixture and stems, gain 0.1. Its stem-referenced speech loss is recorded per case alongside hybrid; the benchmark gate requires hybrid loss lower in all 15 cases. Target attenuation is measured against each original dishes stem and residual output (`output - speech stem`). Speech distortion is measured from that same residual against the original speech stem.

## Limits / RED gates

- Synthetic signals only; no field speech or recorded dishes.
- Node offline latency is not browser real-time latency.
- Target detection is a deterministic high-band transient heuristic, not semantic classification.
- No claim of neural separation, WebGPU/WASM inference, or production quality.
- Existing production `UnavailableSeparator` remains fail-closed; this lane does not alter UI, capture, or shared contracts.
