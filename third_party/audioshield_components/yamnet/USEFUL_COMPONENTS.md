# YAMNet intake

This folder is an isolated, curated intake from `tensorflow/models`, not an
AudioShield implementation. The upstream checkout was cloned to
`/tmp/audioshield-oss-scan/tensorflow-models` and inspected at exact HEAD
`dd3514a41bc2fbafb2d15b58ba36ef20933866d4` on 2026-08-16. Only the files listed
in `SOURCE.json` were copied.

## License boundary

The repository root `LICENSE` states that all files under `/research` are
Apache-2.0. The copied source files that carry upstream headers retain them;
the repository-level license governs files without a local header. `LICENSE`
is retained here for redistribution. Retain the copyright and license notices
if any copied source is adapted.

The YAMNet code license and the model-weight license are separate. The upstream
README links the Keras checkpoint at
`https://storage.googleapis.com/audioset/yamnet.h5`, but does not state a
license for that binary. The TensorFlow Hub archive at
`https://tfhub.dev/google/yamnet/1?tf-hub-format=compressed` contains SavedModel
variables and the class map, but no LICENSE or NOTICE establishing a weight
license. Both artifacts are therefore `BLOCKED_UNKNOWN`; neither was copied.
Do not download, vendor, or ship them until an explicit artifact license is
located and reviewed. The AudioSet dataset and its YouTube-derived contents
also have separate terms; no AudioSet audio or embeddings were copied.

## Detector contract

YAMNet is an event detector, not a separator. It emits semantic class scores
that can drive a target-selection policy, but it cannot isolate dishes, an
alarm, or speech from an overlapping mixture. A separate source-separation
stage remains required for target-selective attenuation.

From `params.py`, `features.py`, and the upstream README:

- Input is mono, 16 kHz, float32 waveform samples expected in approximately
  `[-1, +1]`.
- STFT window is 25 ms (400 samples), hop is 10 ms (160 samples), and the
  periodic Hann window is used by TensorFlow's STFT path.
- The feature path uses a 512-point FFT, 64 mel bands from 125 Hz through
  7500 Hz, then `log(mel + 0.001)`.
- Each model patch is 96 STFT frames (0.96 s) and the default patch hop is 48
  frames (0.48 s). Padding requires about 0.975 s of waveform before the
  first complete output patch.
- `yamnet_frames_model()` returns per-patch predictions with shape
  `[num_patches, 521]`, 1024-dimensional embeddings, and the log-mel matrix.
  Predictions use sigmoid class scores; they are not mutually exclusive.
- The README reports 3.7M weights and 69.2M multiplies per 960 ms frame.

## Relevant verified class indices

These names and indices are copied from `yamnet_class_map.csv` (index is the
model output column, not a score threshold):

| Index | Class | Possible AudioShield rule |
| ---: | --- | --- |
| 0 | Speech | Preserve speech |
| 1 | Child speech, kid speaking | Preserve speech-like content |
| 2 | Conversation | Preserve speech-like content |
| 62 | Applause | Optional trigger |
| 304 | Car alarm | Optional alarm trigger |
| 317 | Police car (siren) | Optional siren trigger |
| 318 | Ambulance (siren) | Optional siren trigger |
| 319 | Fire engine, fire truck (siren) | Optional siren trigger |
| 358 | Dishes, pots, and pans | Optional dishes trigger |
| 359 | Cutlery, silverware | Optional cutlery trigger |
| 382 | Alarm | Optional alarm trigger |
| 389 | Alarm clock | Optional alarm trigger |
| 390 | Siren | Optional siren trigger |
| 391 | Civil defense siren | Optional siren trigger |
| 393 | Smoke detector, smoke alarm | Optional alarm trigger |
| 394 | Fire alarm | Optional alarm trigger |
| 436 | Chink, clink | Optional clink trigger |
| 437 | Shatter | Optional breakage trigger |
| 463 | Smash, crash | Optional impact trigger |
| 483 | Clatter | Optional clatter trigger |

These are vocabulary candidates only. The source does not establish that any
class has acceptable precision/recall for an accessibility rule, and no
threshold calibration or browser validation was performed in this intake.

## Browser usefulness and required adaptation

`export.py` explicitly builds TF2 SavedModel, TFLite, and TFJS exports. That is
evidence that a browser-oriented conversion path exists in the upstream
tooling, but it does not prove that the generated artifact is suitable for
MV3, WebGPU, or real-time playback. The export script requires TensorFlow,
TensorFlow Hub, and the TensorFlow.js converter, and it consumes the separate
HDF5 weights file.

The likely browser choices are:

1. Generate a small, fixed-input TFJS or TFLite artifact offline after weight
   licensing is cleared, then benchmark it in the extension's worker/offscreen
   context.
2. Independently convert/validate a model for ONNX Runtime Web if that runtime
   is selected by the broader intake. The YAMNet repository contains no ONNX
   exporter, ONNX graph, or ONNX operator compatibility report, so ONNX
   conversion is `UNVERIFIED` here.

The Python implementation is not browser-ready: it imports TensorFlow/tf-keras,
NumPy, resampy, and soundfile. The browser adapter must reproduce resampling,
mono folding, waveform normalization, framing, mel features, and output-index
mapping. A streaming implementation should retain at least the rolling context
needed for the 0.96 s patch and emit scores on the 0.48 s cadence; exact
latency and overlap behavior must be measured rather than inferred.

The model is convolutional and the code includes a TFLite-compatible STFT
branch, which is useful evidence for conversion. There is no browser benchmark
or Chrome compatibility test in this upstream path. WebGPU suitability,
unsupported operators after ONNX conversion, model download size, memory use,
and end-to-end detector latency are all `UNVERIFIED`.

## Copied file roles

- `yamnet.py`: model architecture and prediction/embedding outputs; `ADAPT`.
- `features.py`: authoritative preprocessing and TFLite-compatible STFT;
  `ADAPT`.
- `params.py`: immutable hyperparameter contract; `DIRECT_USE` as a reference
  specification, not browser Python.
- `inference.py`: reference mono conversion, normalization, resampling, and
  score aggregation; `ADAPT`.
- `export.py`: offline TF2/TFLite/TFJS export and sanity-check flow; `ADAPT`.
- `yamnet_class_map.csv`: 521-index class vocabulary; `DIRECT_USE`.
- `yamnet_test.py`: silence, white-noise, and sine-wave regression ideas;
  `ADAPT`.
- `README.md`: upstream model contract, performance figures, and artifact URL;
  `ADAPT`.

No model weights, AudioSet audio, embeddings, or generated browser model were
copied.
