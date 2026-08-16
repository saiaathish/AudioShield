# Demucs intake: reference only

Status: `REFERENCE_ONLY`

This folder is an isolated, license-reviewed reference intake. It is not a
production separator and must not be imported by AudioShield runtime code.

## Exact source

- Repository: https://github.com/facebookresearch/demucs
- Owner/name: `facebookresearch/demucs`
- Branch: `main`
- Pinned commit: `e976d93ecc3865e5757426930257e200846a520a`
- Clone used for inspection: `/tmp/audioshield-oss-scan/demucs/`
- Clone timestamp recorded from the temporary clone: `2026-08-16T09:56:12Z`
- Repository state: archived, verified through GitHub repository metadata
- Code license: MIT, verified from the pinned root `LICENSE`, the pinned
  README, and repository metadata

The copied files retain their upstream copyright/license headers. Keep the
`LICENSE` file with any later redistribution of this material.

## Curated files

| Local file | Upstream path | Classification | Why it matters |
| --- | --- | --- | --- |
| `extracted/demucs/apply.py` | `demucs/apply.py` | `REFERENCE_ONLY` | `TensorChunk` handles centered padding; `apply_model` shows segment splitting, overlap stride, triangular transition weights, weighted accumulation, sum-weight normalization, optional shift averaging, and center trimming. |
| `extracted/demucs/evaluate.py` | `demucs/evaluate.py` | `REFERENCE_ONLY` | Shows MDX-style nSDR, museval BSS metrics, per-track source aggregation, and the boundary between mixture normalization and restored output scale. |
| `extracted/demucs/utils.py` | `demucs/utils.py` | `REFERENCE_ONLY` | Provides `center_trim`, frame unfolding, and a deterministic synchronous executor useful when designing offline chunk-boundary tests. |

The files are unchanged copies. Their source blob IDs and SHA-256 hashes are
recorded in `SOURCE.json`.

## AudioShield-relevant patterns

### Chunking and overlap-add

`apply_model` derives a segment length from the model sample rate, advances by
`(1 - overlap) * segment_length`, and sends each chunk through the model. It
uses a triangular per-sample transition weight, accumulates weighted estimates,
accumulates the same weights into `sum_weight`, then divides by `sum_weight`.
This is a useful offline reference for avoiding discontinuities at chunk
boundaries. `TensorChunk.padded()` also documents centered padding at the start
and end of a finite signal.

For a future browser implementation, the algorithm would need a bounded ring
buffer, explicit look-ahead/latency accounting, interruption-safe flushing,
sample-accurate output alignment, and a fail-closed behavior when a chunk or
model result is unavailable. The copied PyTorch implementation is not a
drop-in AudioWorklet or ONNX Runtime Web component.

### Normalization and reconstruction

The evaluation path reduces the input to a mono reference for normalization,
applies `(mix - mean) / std`, converts sample rate/channel count for the model,
then restores `std` and `mean` after inference. This is a benchmark convention,
not a safe live-tab policy: blindly applying whole-track normalization could
change perceived loudness and speech-preservation behavior. The related
`demucs/audio.py` and `demucs/wav.py` files were inspected but not copied
because they are dataset/file-I/O code coupled to ffmpeg, torchaudio, julius,
and MUSDB.

### Evaluation

`new_sdr` measures reference energy against residual error. `eval_track` also
shows how BSS SDR/SIR/ISR/SAR can be computed and aggregated. AudioShield would
need a different fixture contract: a mixed browser-like input, a selected
semantic target, a preserved speech reference, and an attenuated/recombined
output. Useful product-specific measurements should include target attenuation,
non-target leakage, speech quality/preservation, latency, clipping, and
recovery after missing/late model output. Demucs music-stem scores must not be
presented as semantic sound-separation evidence.

## Fit and limitations

Demucs is a music source-separation system. The pinned README describes stems
such as drums, bass, other, and vocals; it does not provide natural-language or
semantic class conditioning for `dishes`, `alarm`, or arbitrary browser
sounds. It also depends on PyTorch and substantial model memory/compute. The
hybrid waveform/spectrogram architecture is valuable as an offline research
reference, but this intake contains no model architecture, checkpoint, export,
ONNX, WebGPU, or browser runtime integration.

Therefore:

- It can inform an offline oracle or chunk/reconstruction experiment.
- It cannot currently satisfy AudioShield's target-selective semantic
  attenuation requirement.
- It is not a browser candidate and is not a production dependency.
- It must not be used to claim real-time Chrome performance or semantic
  separation quality.

## Model-weight gate

The pinned code builds checkpoint URLs under
`https://dl.fbaipublicfiles.com/demucs/` from `demucs/remote/files.txt`.
No explicit license covering those `.th` artifacts was found in the pinned
repository or the host metadata inspected for this intake. The MIT license for
the source repository is not assumed to cover weights. All pretrained Demucs
checkpoints are consequently `BLOCKED_UNKNOWN`; none are downloaded or copied
here.

## Future adaptation gate

Any future agent adapting this material must keep the MIT attribution, retain
the AIcrowd MIT attribution comment in `evaluate.py`, replace the MUSDB/music
assumptions with AudioShield fixtures, and prove chunk alignment and
fail-closed behavior with tests. That work requires a separate implementation
authorization and is outside this intake task.
