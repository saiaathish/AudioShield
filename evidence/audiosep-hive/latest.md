# AudioSep-hive evidence

- Verdict: **GREEN_OFFLINE_ORACLE**
- Model: `AlayaLab/AudioSep-hive@113d2e4399a4f19b6a0d567bbde38f2fe1b11794`
- Source: `AlayaLab/Hive@f41b507d6be616ba864a5cd538b071338b6bd90d`
- Model/source license gate: **PASS** — model card metadata `apache-2.0`; source `LICENCE` is Apache-2.0.
- Repo head tested: `353b4105e30de9079fba8ce65acb1c7c848622d8`
- Production wiring: **unchanged**
- Browser inference: **NOT_TESTED**

## Artifact verification

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `audiosep_hive.ckpt` | 1,264,846,755 | `a13fff5fa4ece1a8bc13e42e1c7b8d90e21603075302ca89e4339c9471973300` |
| `music_speech_audioset_epoch_15_esc_89.98.pt` | 2,352,471,003 | `51c68f12f9d7ea25fdaaccf741ec7f81e93ee594455410f3bca4f47f88d8e006` |
| `FacebookAI/roberta-base` | pinned revision `e2da8e2f…` | MIT |

The Hive source’s official inference script still references the historical `ShandaAI/AudioSep-hive` host, which is unavailable. The run used the same files from the pinned transferred `AlayaLab/AudioSep-hive` model repository.

## Speech+dishes run

Input was the existing deterministic synthetic `speech+dishes` fixture: 44.1 kHz stereo, 1 second. The temporary harness downmixed and resampled it to the model’s 32 kHz mono contract. Query: `dishes clattering`. Device: CPU. Inference time: **22.81 s**. Maximum resident set: **1,769,275,392 bytes**; peak memory footprint reported by `/usr/bin/time -l`: **5,706,143,624 bytes**.

Measured output at -14 dB target-estimate attenuation:

| Measure | AudioShield estimate-gated output | Global -14 dB duck |
|---|---:|---:|
| Speech amplitude gain | **-0.04 dB** | -14.00 dB |
| Dishes amplitude gain | **-12.45 dB** | -14.00 dB |
| Target estimate SI-SDR vs dishes | **10.68 dB** | n/a |
| Residual speech SI-SDR vs speech | **15.17 dB** | n/a |

Outputs are in `output/`: target estimate, residual, processed mixture, and global-duck baseline. Full machine-readable values and hashes are in `metrics.json`.

## Boundary

This proves a licensed, runnable offline AudioSep-hive oracle and a measured target-gated WAV path on the fixed synthetic fixture. It does not prove Chrome execution, real-time latency, live tab capture, broad-class accuracy, or perfect source isolation. No production code was changed.
