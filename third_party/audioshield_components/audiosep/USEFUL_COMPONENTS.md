# AudioSep intake

This folder is a curated, source-preserving intake from `Audio-AGI/AudioSep` at commit
`944583f18b84589dc965de3ad77525c945334252` (`main`). It is not integrated into
AudioShield. The copied files retain their upstream relative paths under `extracted/`.

## License and provenance

- Upstream source license: MIT, verified from the upstream `LICENSE` file.
- MIT attribution must remain with copied source: `Copyright (c) Xubo Liu`.
- The exact source commit, copied-file blob hashes, and separately checked model artifacts
  are in `SOURCE.json`.
- No model weights, evaluation data, or external tokenizer files were copied.
- The upstream repository has no checked-in checkpoint files; its code refers to external
  files under `checkpoint/`.

## What is useful

| Area | Intake files | Classification | AudioShield relevance |
| --- | --- | --- | --- |
| End-to-end reference | `pipeline.py`, `models/audiosep.py` | ADAPT | Defines the mixture + text condition + target waveform contract. |
| Text conditioning | `models/clap_encoder.py` | ADAPT | Natural-language target queries become 512-dimensional frozen CLAP embeddings. |
| Target separator | `models/resunet.py` | ADAPT | FiLM-conditioned ResUNet predicts one target waveform from a mixture. |
| STFT/reconstruction | `models/base.py`, `models/resunet.py` | ADAPT | Phase-aware mask reconstruction with the model’s exact STFT settings. |
| Checkpoint loading | `utils.py`, `models/audiosep.py` | ADAPT | Reproduces the PyTorch model construction and Lightning checkpoint contract. |
| Metrics | `utils.py`, `benchmark.py`, `evaluation/*` | ADAPT | SDR, SI-SDR, SDR improvement, and per-class median aggregation. |
| Reproduction config | `config/audiosep_base.yaml` | ADAPT | Captures sample rate, segment length, channel count, and model dimensions. |

## Inference pipeline

The verified upstream path is:

```text
audio file
  -> librosa.load(sr=32000, mono=True)
  -> CLAP text embedding (512 values)
  -> ResUNet30 FiLM layers
  -> STFT magnitude/phase features
  -> conditioned spectrogram mask
  -> ISTFT target waveform
  -> int16 WAV
```

The model is target-selective in the sense that the natural-language condition changes
the separator mask. It returns one estimated target waveform; it does not return a
residual/non-target stem or perform AudioShield’s final attenuation and recombination.
AudioShield would need to compute a residual or otherwise preserve the original mixture,
apply the requested gain to the estimated target, and recombine with explicit clipping and
latency policy.

## STFT and separator details

Verified in `models/resunet.py`:

- sample rate: 32,000 Hz;
- Hann window: 2,048 samples (64 ms);
- hop: 320 samples (10 ms);
- centered STFT with reflect padding;
- 1 input channel, 1 output channel, one target source;
- magnitude input is batch-normalized, padded to a time dimension divisible by 32, and
  reduced from 513 to 512 frequency bins for the UNet;
- six encoder/decoder stages plus a center block; channel widths rise to 384;
- each residual block receives condition-derived beta tensors through FiLM;
- output has three values per frequency bin: sigmoid magnitude mask plus tanh real/imag
  phase-mask terms;
- the predicted magnitude and rotated input phase are reconstructed with ISTFT.

The config uses 5-second training segments (`segment_seconds: 5`) and the runtime model
accepts a variable waveform length, subject to the model’s padding and memory behavior.

## Text conditioning

`models/clap_encoder.py` constructs a frozen `HTSAT-base` CLAP model and a frozen
`roberta-base` tokenizer/text path. Text is padded/truncated to 512 tokens. At inference,
`get_query_embed(modality='text', text=[query])` returns a float embedding consumed by the
512-wide FiLM projections. For a fixed AudioShield vocabulary, precomputing text embeddings
is technically plausible and would remove per-buffer tokenization/CLAP text execution, but
that does not make the separator itself browser-real-time.

The audio branch is separate: it asserts 32 kHz input, resamples to 48 kHz, and prepares
480,000-sample CLAP audio features. AudioShield’s text-only path does not need that branch.

## Chunk inference

`ResUNet30.chunk_inference` uses these exact constants:

```text
left context  NL = 1.0 s
center        NC = 3.0 s
right context NR = 1.0 s
window             5.0 s
advance            3.0 s
rate          32000 Hz
```

The same text condition is reused for every chunk. The implementation writes center
regions into a preallocated NumPy array; it is not a weighted overlap-add implementation.
The trailing branch and strict `current_idx + WINDOW < L` condition need dedicated tests:
short/exactly-5-second inputs can leave the leading context unwritten, and adjacent writes
can overwrite rather than crossfade. These are upstream behaviors to adapt, not validated
AudioShield behavior.

## Browser/export assessment

`BROWSER_CANDIDATE`: only the interface and fixed-query embedding idea. The copied
separator is `OFFLINE_REFERENCE`/`TOO_HEAVY` for first implementation:

- the main checkpoint is 1,264,844,076 bytes; the CLAP checkpoint is 2,352,471,003 bytes;
- the code is PyTorch/Lightning plus `torchlibrosa`, `librosa`, Transformers, and a vendored
  CLAP implementation, with no ONNX export script or browser runtime path in this snapshot;
- no repository evidence establishes an ONNX export, an ONNX Runtime Web run, WebGPU
  compatibility, operator coverage, model memory budget, or real-time latency;
- the separator uses STFT/ISTFT, dynamic padding, BatchNorm, ConvTranspose2d, nested FiLM
  projections, and NumPy chunk orchestration. Exact ONNX operator support and numerical
  parity are **UNVERIFIED** until an export is attempted against a pinned toolchain;
- browser stereo is not supported by the reference pipeline: `librosa.load(..., mono=True)`
  downmixes input and the model config is single-channel. A future adapter would need an
  explicit stereo policy (downmix, linked channels, or per-channel inference).

The practical use is an offline oracle for reference separated samples and a benchmark
against lighter browser candidates. It can also inform a future fixed-query/small-model
distillation experiment.

## Metrics and benchmark caveats

`utils.py` implements:

- SDR as `10*log10(mean(ref^2) / mean((est-ref)^2))` with an epsilon floor;
- SI-SDR using a least-squares scale of the estimate onto the reference;
- SDR improvement as separated SDR minus mixture SDR in the evaluators.

The benchmark runs AudioSet, AudioCaps, VGGSound, MUSIC, ESC-50, and Clotho evaluators.
AudioSet maps its verified CSV class labels to text queries, samples up to ten items per
class, then reports per-class medians before the aggregate mean. These metrics are useful
for offline separation quality, but they do not prove browser latency, perceptual quality,
or safe target-selective attenuation in a live tab.

## Known upstream blockers and uncertainty

1. **Upstream API mismatch:** `pipeline.py` defines `separate_audio`, while the README and
   `predict.py` import `inference`. The copied source is unchanged; an adapter must resolve
   this before execution.
2. **Checkpoint availability:** all model artifacts remain external downloads. They are
   license-verified in `SOURCE.json`, but their size makes them unsuitable for casual
   extension bundling. No weights were copied.
3. **CLAP transitive runtime:** the copied encoder imports the repository’s vendored CLAP
   tree and external Transformers/tokenizer weights. That tree was intentionally not copied
   wholesale; a future user must re-audit its third-party notices and dependencies before
   redistributing it.
4. **No ONNX proof:** no export function, exported graph, unsupported-op report, or WebGPU
   benchmark exists in the inspected snapshot. Treat ONNX/WebGPU claims as **UNVERIFIED**.
5. **Chunk edge behavior:** the context/chunk writer is not validated as overlap-add and
   needs boundary tests before it can be used for continuous audio.
6. **Attenuation contract missing:** AudioSep estimates a target stem only. It does not
   implement AudioShield’s preserve-speech policy, gain smoothing, residual preservation,
   clipping guard, or output rerouting.

Two checkpoint names used only by upstream `__main__`/benchmark convenience paths have no
identified host or artifact license and are therefore recorded as `BLOCKED_UNKNOWN` in
`SOURCE.json`. Unknown or restrictive artifacts are not copied. If a future checkpoint host
lacks an explicit artifact license, keep it `BLOCKED_UNKNOWN` and do not add it to this folder.
