# Worker A legal model rescue report

- Status: **RESEARCH_COMPLETE**
- Scope: official-source provenance/licensing research only
- Repo head inspected: `353b4105e30de9079fba8ce65acb1c7c848622d8`
- Generated: `2026-08-16T15:33:14Z`
- Model bodies downloaded: **none**
- Production files changed by this lane: **none**

## Result

The strongest legally cleared candidates are SpeechBrain `sepformer-wham` and `sepformer-whamr16k`, both Apache-2.0 at the model-card and source-code scope. They are offline PyTorch speech-separation models, not browser-ready semantic dishes separators. `sepformer-whamr16k` is the closest legal fit for a separately authorized speech-preserving fallback because its official input is 16 kHz mono.

No browser-ready candidate with fully explicit weight clearance was found in this research lane. YAMNet, Waveformer, AudioSep-hive, and RNNoise have permissive source code, but their separately hosted weight artifacts have unknown, caveated, or non-explicit terms under the conservative no-unknown-weights gate.

## Candidate findings

### YAMNet — detector — `SAFE_TO_USE: false`

- Code: [tensorflow/models](https://github.com/tensorflow/models), `research/audioset/yamnet`, commit `dd3514a41bc2fbafb2d15b58ba36ef20933866d4`; repository code is Apache-2.0.
- Official weights: [yamnet.h5](https://storage.googleapis.com/audioset/yamnet.h5), 15,296,092 bytes by HTTP HEAD, ETag `8234225c045859752bd4a2e101f8cd1a`; no artifact license was stated in the pinned official README.
- Official TF Hub URL: [google/yamnet/1](https://tfhub.dev/google/yamnet/1?tf-hub-format=compressed). The current endpoint redirects to the Kaggle model page; no machine-readable weight license or archive size was exposed by the inspected response.
- Contract verified from official source/local class map: 521 classes, 16 kHz mono, 0.96 s windows, 0.48 s hop, 3.7M parameters. The actual class map includes `Speech`, `Dishes, pots, and pans`, `Cutlery, silverware`, `Alarm`, `Siren`, `Applause`, and `Clatter`.
- Decision: source is safe; weights remain blocked. Do not vendor or generate a browser artifact from them.

### AudioSep-hive — query separator — `SAFE_TO_USE: false`

- Code: [AlayaLab/Hive](https://github.com/AlayaLab/Hive), commit `f41b507d6be616ba864a5cd538b071338b6bd90d`; `LICENCE` is Apache-2.0. The model card’s ShandaAI/Hive alias resolves to this repository.
- Model revision: [ShandaAI/AudioSep-hive](https://huggingface.co/ShandaAI/AudioSep-hive/tree/113d2e4399a4f19b6a0d567bbde38f2fe1b11794), revision `113d2e4399a4f19b6a0d567bbde38f2fe1b11794`.
- Required separator checkpoint: `audiosep_hive.ckpt`, 1,264,846,755 bytes, LFS SHA-256 `a13fff5fa4ece1a8bc13e42e1c7b8d90e21603075302ca89e4339c9471973300`.
- Required CLAP checkpoint: `music_speech_audioset_epoch_15_esc_89.98.pt`, 2,352,471,003 bytes, LFS SHA-256 `51c68f12f9d7ea25fdaaccf741ec7f81e93ee594455410f3bca4f47f88d8e006`.
- The HF metadata says Apache-2.0, but the model card says `Apache 2.0 (Please update if different)` and gives no separate license for the required CLAP artifact. The official inference script requires both files, roughly 3.62 GB before dependencies.
- Official runtime is Python/PyTorch, torchaudio, librosa, PyTorch Lightning, Hugging Face Hub; 32 kHz mono text-query inference. No official browser path was found.
- Decision: promising architecture, but not legally clear enough for this gate and impractical for today’s browser lane. No weights downloaded.

### Waveformer — streaming target extraction — `SAFE_TO_USE: false`

- Code: [vb000/Waveformer](https://github.com/vb000/Waveformer), commit `db51a4916e8001db1d6fde8cc9c19a3bed82a1b5`; source is MIT.
- Official default checkpoint: [default_ckpt.pt](https://targetsound.cs.washington.edu/files/default_ckpt.pt), 46,902,639 bytes by HTTP HEAD. Official archive: [experiments.zip](https://targetsound.cs.washington.edu/files/experiments.zip), 260,959,018 bytes. Neither hosted checkpoint had explicit license terms in the inspected official source/docs.
- Official source reports streaming ~10 ms chunks, `<20 ms` end-to-end latency and 0.66–0.94 real-time factors on a one-thread Core i5. The target list includes `Applause`, `Computer_keyboard`, and `Cough`; no dishes target was observed.
- Decision: technically interesting local candidate, but checkpoint redistribution is blocked. No checkpoint downloaded.

### SepFormer WHAM — speech-preserving fallback — `SAFE_TO_USE: true` at license scope

- Model: [speechbrain/sepformer-wham](https://huggingface.co/speechbrain/sepformer-wham/tree/3f70635a1a640713e5af867b35de7929834bdeda), revision `3f70635a1a640713e5af867b35de7929834bdeda`; model card declares Apache-2.0.
- Training code: SpeechBrain commit `e375cd130e44aaa18561f3a1024a61c5eff2d124`; source license Apache-2.0.
- Inference payload: `masknet.ckpt` 113,112,646 bytes plus encoder/decoder 17,272 bytes each, 113,147,190 bytes total. The 205,694,713-byte optimizer checkpoint is not required for inference.
- Official runtime: SpeechBrain/PyTorch/torchaudio; 8 kHz mono; CPU or CUDA. It is speech separation trained on WHAM environmental-noise mixtures, not semantic dishes extraction and not a browser path.

### SepFormer WHAMR16k — preferred legal fallback candidate — `SAFE_TO_USE: true` at license scope

- Model: [speechbrain/sepformer-whamr16k](https://huggingface.co/speechbrain/sepformer-whamr16k/tree/21a5b500c6f52fddc387c5d9e5fb13ffd6f039c5), revision `21a5b500c6f52fddc387c5d9e5fb13ffd6f039c5`; model card declares Apache-2.0.
- Training code: SpeechBrain commit `fc2eabb7416b0ae68b3baaadb39972ea1d153985`; source license Apache-2.0.
- Inference payload: `masknet.ckpt` 113,112,646 bytes plus encoder/decoder 17,272 bytes each, 113,147,190 bytes total. The 205,694,713-byte optimizer checkpoint is not required for inference.
- Official runtime: SpeechBrain/PyTorch/torchaudio; 16 kHz mono; CPU or CUDA. This is the best legal fit for a local speech-preserving residual experiment, but no overlap output, latency, or browser proof was produced here.

### RNNoise — speech enhancement — `SAFE_TO_USE: false` at model scope

- Code: [xiph/rnnoise](https://github.com/xiph/rnnoise), commit `70f1d256acd4b34a572f999a05c87bf00b67730d`; source is BSD-3-Clause.
- Official model archive: [rnnoise_data-0a8755f8...tar.gz](https://media.xiph.org/rnnoise/models/rnnoise_data-0a8755f8e2d834eff6a54714ecc7d75f9932e845df35f8b59bc52a7cfe6e8b37.tar.gz), 58,603,099 bytes by HTTP HEAD. The pinned `model_version`/download script supplies SHA-256 `0a8755f8e2d834eff6a54714ecc7d75f9932e845df35f8b59bc52a7cfe6e8b37`; the archive body was not downloaded.
- Official runtime is native C at 48 kHz, 480-sample frames, 10 ms hop/20 ms analysis window. RNNoise is noise suppression/speech enhancement, not a semantic detector or source separator.
- Decision: source safe; model archive license remains unknown. No archive downloaded.

## Concrete repository paths

Written by this lane:

- `/Users/saiaathishkarthik/Desktop/AudioShield/evidence/model-rescue.json`
- `/Users/saiaathishkarthik/Desktop/AudioShield/evidence/model-rescue.md`

Existing intake evidence cross-checked:

- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/yamnet/SOURCE.json`
- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/yamnet/USEFUL_COMPONENTS.md`
- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/audiosep/SOURCE.json`
- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/audiosep/USEFUL_COMPONENTS.md`
- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/rnnoise/SOURCE.json`
- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/rnnoise/USEFUL_COMPONENTS.md`
- `/Users/saiaathishkarthik/Desktop/AudioShield/third_party/audioshield_components/yamnet/extracted/research/audioset/yamnet/yamnet_class_map.csv`

## Handoff limits

This report does not claim that any candidate performs useful separation. It contains no generated audio, inference timing, memory measurement, selective attenuation metric, speech-preservation metric, Chrome smoke result, or production integration. The next authorized implementation lane should start with SepFormer WHAMR16k and must independently verify the actual speech+dishes output before making a product claim.
