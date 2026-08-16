# RNNoise curated intake

## Decision

The pinned `xiph/rnnoise` source is license-safe for this intake under the repository's BSD 3-Clause terms. The curated files are useful as low-latency frame/DSP and recurrent-inference references. Only `extracted/rnnoise.h` is marked `REUSABLE_INTERFACE`; the implementation files are marked `REFERENCE` because they are native C, require the generated model and additional build context, and are not a drop-in Chrome MV3/Web Audio implementation.

RNNoise is a speech-oriented noise suppressor. It is not a semantic target separator. It must not be presented as proof that AudioShield can attenuate dishes or alarms while preserving speech in overlapping tab audio.

## Useful files

| File | Class | Why it helps | Boundary |
| --- | --- | --- | --- |
| `extracted/rnnoise.h` | REUSABLE_INTERFACE | Documents the frame API, state lifetime, model loading, and the native `rnnoise_process_frame` contract. | Reuse requires an independently verified native/WASM build and BSD attribution; this header alone provides no browser runtime. |
| `extracted/denoise.c`, `denoise.h` | REFERENCE | Concrete 48 kHz frame pipeline: 480 samples per call, 960-sample analysis window, overlap-add synthesis, one-frame delayed spectral processing, high-pass biquad, 32-band energy features, and smoothed gains. | Do not transplant blindly into an AudioWorklet; validate latency, channel handling, sample-rate conversion, and allocation behavior. |
| `extracted/kiss_fft.c`, `kiss_fft.h`, `_kiss_fft_guts.h`, `rnnoise_tables.c` | REFERENCE | FFT, window/table, and frequency-domain building blocks used by the frame path. | C implementation only; a Web Audio port needs its own build and numerical regression tests. |
| `extracted/pitch.c`, `pitch.h` | REFERENCE | Pitch search/downsampling and correlation features support speech continuity and voiced-speech preservation. | Pitch features are not semantic labels and cannot authorize target attenuation. |
| `extracted/rnn.c`, `rnn.h`, `nnet.c`, `nnet.h`, `nnet_arch.h`, `vec.h` | REFERENCE | Shows bounded recurrent state, GRU/conv/dense inference, sparse/vector kernels, and per-frame gain/VAD inference. | Requires `rnnoise_data.h`/model data, which is absent from this clone and intentionally blocked here. |
| `extracted/common.h`, `arch.h`, `opus_types.h` | REFERENCE_SUPPORT | Small support contracts needed to understand the curated C references and their portability assumptions. | Not an AudioShield public API. |

## Low-latency observations

- The public API processes a fixed frame size. The current source defines `FRAME_SIZE` as 480 samples and `WINDOW_SIZE` as 960 samples, corresponding to 10 ms hops and a 20 ms analysis window at 48 kHz.
- `denoise.c` carries analysis and synthesis memory across calls. It delays spectral gain application by one frame, then uses overlap-add synthesis; this is a useful latency/state reference for an AudioWorklet design.
- The recurrent path emits 32-band gains plus a VAD probability. Those outputs are suppression controls, not source-separated stems or semantic confidence for AudioShield rules.
- The implementation is stateful and frame-oriented. A browser port would need a bounded ring buffer and explicit handling for arbitrary Web Audio render quantum sizes.

## Model and data decision

No model weights, checkpoints, generated `rnnoise_data.c/.h`, binary blobs, training audio, RIRs, or noise datasets were copied. The repository's build script downloads the model archive externally using the hash in `model_version`; no model license was verified from the pinned repository. Treat all such artifacts as `BLOCKED_UNKNOWN_LICENSE` until their exact artifact and license are separately verified and approved.

## AudioShield fit

The safe follow-on use is to borrow the frame scheduler, spectral overlap-add, state continuity, and speech-preservation evaluation ideas while keeping AudioShield's detector/separator contract separate. Any implementation agent must prove that the resulting system attenuates only the selected source in overlap tests; a passing RNNoise-style VAD or noise-suppression result is insufficient.
