# Semantic Hearing intake

## Verdict

This is the strongest source-separation architecture found in this intake, but the checked-in repository is not a browser-ready runtime. It contains a PyTorch causal, target-conditioned waveform separator trained for binaural environmental recordings. Treat the copied code as `OFFLINE_REFERENCE` / `ADAPT`, not as an immediately shippable MV3 dependency.

The repository itself is MIT-licensed and its license is copied to `LICENSE`. The separately hosted `39.pt` checkpoint is `BLOCKED_UNKNOWN`; it is not included here. A repository MIT license does not automatically license that separately hosted weight file.

## Copied components

- `extracted/src/training/dcc_tf.py` — the reusable architecture core. It contains `mod_pad`, a causal dilated depthwise-separable convolution encoder, a chunked causal transformer decoder, `MaskNet`, and the mono `Net` waveform encoder/mask/decoder path.
- `extracted/src/training/dcc_tf_binaural.py` — the two-channel wrapper. It changes the input and output convolutions to two channels, applies a 20-dimensional multi-hot label vector through a learned embedding, carries encoder/decoder/output buffers between calls, and returns the extracted target waveform.
- `extracted/src/training/datasets/curated_binaural.py` — the exact label ordering used by the training dataset. This ordering is more authoritative than the order in `data/Classes.yaml` for constructing the model vector.
- `extracted/experiments/dc_waveformer/config.json` — the checked-in experiment parameters needed to reproduce the architecture shape: `sr=44100`, `L=32`, `label_len=20`, `model_dim=256`, `num_enc_layers=10`, `num_dec_layers=1`, `dec_buf_len=13`, `dec_chunk_size=13`, `conditioning=mult`, and `out_buf_len=4`.
- `LICENSE` — the upstream MIT notice.

## Model and target-conditioning path

The model accepts `inputs['mixture']` shaped `[batch, channels, samples]` and `inputs['label_vector']` shaped `[batch, 20]`. The binaural wrapper uses two input and two output channels. The label vector is passed through `Linear(20→512)`, normalization/ReLU, then `Linear(512→model_dim)` and normalization/ReLU. That embedding conditions the mask generator; the output is a target estimate, not a class score.

The waveform path is:

```text
2-channel mixture
  → strided Conv1d + ReLU
  → causal dilated depthwise-separable convolution encoder
  → chunked causal Transformer decoder conditioned by label embedding
  → latent mask
  → ConvTranspose1d + tanh
  → 2-channel target estimate
```

The configured `conditioning="mult"` uses the embedding as a multiplicative conditioning signal. The source also contains `conv`, `attn`, and `film` branches in the generic decoder, but the checked-in experiment selects `mult`.

## Streaming and latency implications

The source has an explicit streaming state contract. `Net.init_buffers()` creates encoder context, decoder context, and output overlap buffers. `forward()` accepts those buffers and returns updated buffers when initialized state is supplied. `mod_pad()` makes input lengths divisible by the latent stride/chunk size and removes temporary padding afterward.

The configured `L=32` means one latent step is 32 samples. `lookahead=True` is the default and uses a `3*L` input kernel plus left/right padding; this is not strictly zero-lookahead. The causal encoder retains `(kernel_size-1)*(2^num_enc_layers-1)` latent samples of context. With the configured 10 layers and 44.1 kHz rate, that is 2,046 latent positions, so the effective receptive field is substantial; exact end-to-end latency was not measured here. The decoder processes 13-frame chunks and keeps a 13-frame context in the experiment config.

For AudioShield, a future adapter must keep state per active capture stream, reset it on capture restart, define a fixed chunk size, and measure the actual output delay before enabling attenuation. The model estimates the selected source; a separate recombination step is still required to preserve the non-selected source (`output = mixture - target + attenuated_target`, subject to quality safeguards).

## Preprocessing and domain fit

The model files themselves do not resample or normalize browser audio. The training dataset code, inspected but not copied, does the following:

- Generates a mono source mixture and convolves each source with two HRTF/HRIR channels.
- Normalizes the binaural mixture and target by mixture peak.
- Uses 44.1 kHz in the checked-in experiment, with an optional torchaudio resampler.
- Builds target vectors from labels selected from synthetic Scaper/JAMS scenes.
- Uses SOFA HRTF metadata and spatial metrics such as ITD/ILD during evaluation.

Therefore:

- `does depend on binaural microphones/HRTFs`: the training distribution and the copied binaural wrapper assume two spatially related channels; the model is not trained in this repository for arbitrary browser stereo.
- `does not depend on binaural microphones`: the causal architecture and target-conditioning pattern are not intrinsically tied to SOFA files at inference, and the mono `dcc_tf.py` variant shows the core can be shaped for one channel.
- `assumes live environmental recording`: the paper/repository target is real-time hearable input, while the checked-in dataset pipeline is synthetic environmental audio with foreground/background labels.
- `could accept browser stereo/mono`: only after an explicit domain decision and validation. Browser stereo may be program audio rather than binaural microphone audio; browser mono needs a separately trained/adapted one-channel contract or a justified channel duplication strategy.
- `must change`: sample-rate/chunk ABI, preprocessing, label vocabulary mapping, model state serialization, export wrapper, and safe recombination/attenuation logic.

## Export practicality

`PyTorch → ONNX` is plausible but unverified. The model uses common convolutions, linear layers, normalization, ReLU, transpose convolution, and Transformer attention, but export requires a wrapper with explicit state tensors. The following are concrete friction points:

- `SpeechBrain` supplies `PositionalEncoding`, so the dependency must be packaged or replaced with an equivalent implementation.
- `nn.Unfold`, grouped functional `conv1d`, custom causal transformer logic, and state mutation need operator/version validation.
- The training forward returns a dictionary in the binaural wrapper and supports optional state arguments; a browser graph should expose a stable tuple of input/output tensors.
- The checkpoint loader is Python `torch.load` over a separately hosted `.pt`; it is not an ONNX model and cannot be treated as a browser artifact.
- Dynamic time lengths, padding, and the 13-frame chunk contract need fixed-shape or carefully dynamic export tests.

`ONNX → ONNX Runtime Web` is a reasonable later experiment after the graph exports. It is not proven by this intake. WebGPU support, WASM fallback, memory use, and real-time throughput remain `UNVERIFIED`; no browser bundle or exported model is included.

## Useful class vocabulary

The canonical model-vector order from `curated_binaural.py` is:

```text
alarm_clock, baby_cry, birds_chirping, cat, car_horn,
cock_a_doodle_doo, cricket, computer_typing, dog, glass_breaking,
gunshot, hammer, music, ocean, door_knock, singing, siren, speech,
thunderstorm, toilet_flush
```

The checked-in `Classes.yaml` maps these project labels to AudioSet-style descriptions. AudioShield concepts such as alarm, siren, speech, dishes, and clatter are not a one-to-one match with this 20-label vocabulary; any mapping must be explicit and tested. In particular, `dishes` and `clatter` are not labels in this repository.

## Inspected but intentionally not copied

`README.md` supplies the checkpoint and dataset URLs. `src/training/datasets/semaudio_binaural_base.py` and `data/multi_ch_simulator.py` are training-time Scaper/SOFA/HRTF synthesis. `src/helpers/eval_utils.py` computes binaural ITD/ILD/DOA metrics. `src/training/eval.py` and `src/helpers/utils.py` are offline training/checkpoint/profiling helpers. They remain summarized here rather than copied because they are not part of a browser inference path.

## License and blocker status

- Repository source: `MIT`, verified from upstream `LICENSE`; retain the notice when distributing copied substantial portions.
- `39.pt`: `BLOCKED_UNKNOWN`; README points to the URL, but no explicit weight license was found in the repository or the hosted project page. Not downloaded.
- `BinauralCuratedDataset.tar`: `BLOCKED_UNKNOWN`; not downloaded or included. Its archive and constituent datasets require separate clearance.
- Python dependencies and SpeechBrain's transitive dependencies are not vendored or cleared by this intake.

See `SOURCE.json` for exact SHA, file hashes, artifact URLs, and the full provenance record.
