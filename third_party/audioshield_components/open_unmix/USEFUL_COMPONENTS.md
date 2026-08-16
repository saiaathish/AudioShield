# Open-Unmix intake — REFERENCE_ONLY

Upstream: `sigsep/open-unmix-pytorch`

Commit: `fb672c9584997c2b05e148eeaa65b4c23ed4693b`

License: MIT, verified from the upstream `LICENSE` file. The copied files are unchanged upstream references. Preserve the MIT notice if any substantial portion is later redistributed.

## Why this is reference-only

Open-Unmix is a music source-separation reference implementation for vocals, drums, bass, and other. It is not a semantic sound separator for browser mixtures such as speech + dishes + alarm. The upstream README states that the default core is a bidirectional LSTM using future context, so it cannot operate online/real-time; the unidirectional option is a training variation, not evidence of a browser-ready model. No Open-Unmix model code or checkpoint is integrated into AudioShield.

The curated material is intentionally limited to STFT, bounded excerpt selection, reconstruction/filtering, and offline metric/test patterns. No model weights, datasets, generated audio, or full repository were copied.

## Curated files

| File | Reference use | AudioShield status |
| --- | --- | --- |
| `extracted/openunmix/transforms.py` | Batched Torch STFT/ISTFT, Hann window, complex magnitude, optional Asteroid filterbank | REFERENCE_ONLY |
| `extracted/openunmix/data.py` | Duration-safe audio loading and random/deterministic fixed-duration excerpts | REFERENCE_ONLY |
| `extracted/openunmix/filtering.py` | Complex multichannel Wiener filter and EM refinement reference | REFERENCE_ONLY |
| `extracted/openunmix/evaluate.py` | MUSDB + museval evaluation orchestration | REFERENCE_ONLY |
| `extracted/tests/test_transforms.py` | STFT → ISTFT round-trip and reconstruction-error test | REFERENCE_ONLY |
| `extracted/tests/test_regression.py` | Offline SDR/SIR/SAR/ISR and spectrogram regression structure | REFERENCE_ONLY |

## Technical findings

### STFT and reconstruction

`openunmix/transforms.py` accepts tensors shaped `(batch, channels, samples)` and returns stacked real/imaginary STFT tensors shaped `(batch, channels, frequency_bins, frames, 2)`. The default transform settings are `n_fft=4096`, `n_hop=1024`, Hann window, and `center=False`; the `Separator` path in upstream `model.py` constructs the filterbank with `center=True` for reconstruction. `TorchISTFT` accepts the original sample length so the inverse result can be cropped deterministically. The copied test asserts a round-trip RMS error below `1e-6` for its fixture.

This is a PyTorch reference, not Web Audio or ONNX Runtime Web code. Porting requires an independently tested browser STFT/ISTFT implementation, explicit frame-state/overlap handling, and a separate latency budget.

### Chunk handling

`openunmix/data.py` uses `seq_duration` in seconds, derives the valid duration from the shortest paired source, and selects a bounded random start when `random_chunks` is enabled. Validation paths can use deterministic starts. This is dataset/training excerpt logic; it does not implement a causal streaming ring buffer, overlap-add scheduler, or browser capture lifecycle.

The upstream separator also batches Wiener filtering by a frame window (`wiener_win_len`, visible in upstream `model.py` and documented by `evaluate.py`), but that file was not copied because the full music-target separator is outside this intake scope.

### Reconstruction and filtering

`openunmix/filtering.py` provides a generalized multichannel Wiener filter and expectation-maximization refinement over complex STFT estimates. It assumes initial target spectrogram estimates and one- or two-channel complex mixtures. It is useful for offline reconstruction experiments, but it is not target-conditioned semantic separation and has no browser-safe resource bounds by itself.

### Metrics

`openunmix/evaluate.py` delegates track evaluation to `museval.eval_mus_track` and stores SDR, SIR, SAR, and ISR frame metrics. `tests/test_regression.py` compares those metrics against stored reference values and separately checks spectrogram reproducibility. These are offline reference metrics requiring MUSDB/museval fixtures; they are not proof of AudioShield selective attenuation, real-time performance, or user benefit. This repository does not provide an AudioShield-specific SI-SDR metric.

## Compatibility answers

- Normal browser mixture: the transform and filtering code can represent mono or stereo tensors, but the trained Open-Unmix targets are music stems. The repository does not prove useful separation of arbitrary browser speech, dishes, or alarms.
- Target representation: Open-Unmix uses one magnitude-spectrogram model per named music target. It does not accept a natural-language or semantic class query.
- Binaural hardware: none is required by this repository; its assumptions are ordinary mono/stereo waveform tensors. That does not make the model suitable for browser tab audio.
- Streaming: the default bidirectional LSTM needs future context and is explicitly not online/real-time. The copied chunk code is dataset excerpting, not streaming inference.
- ONNX/browser export: the upstream `utils.py` documents the optional Asteroid filterbank as practical for ONNX export, but no export artifact, operator audit, model-size measurement, or ONNX Runtime Web test is included here. Treat browser export as UNVERIFIED.
- Model size: no checkpoint was downloaded or measured. Treat model size as UNKNOWN for AudioShield.

## Weight licensing

Weights remain outside `extracted/`.

- UMX and UMX-HQ Zenodo records report MIT in their record metadata; the exact file URLs and record links are in `SOURCE.json`. They are still music-separation artifacts and are not approved as AudioShield models.
- UMX-SE Zenodo record `3786908` reports MIT; no checkpoint was copied.
- UMX-L Zenodo record `5069601` reports `CC-BY-NC-SA-4.0`, and the upstream README explicitly describes the weights as non-commercial. This family is `BLOCKED_LICENSE` under the intake policy.
- A model artifact's license is tracked separately from the repository MIT license. No checkpoint should be vendored without rechecking the live artifact record and any dataset/training restrictions.
