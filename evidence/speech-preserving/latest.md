# Speech-preserving fallback evidence

- Verdict: **QUALITY_BLOCKED**
- Status: **MEASURED**
- Model: `speechbrain/sepformer-whamr16k@21a5b500c6f52fddc387c5d9e5fb13ffd6f039c5`
- Model artifact license: **Apache-2.0** (Hub card metadata: `apache-2.0`)
- Production wiring: **UNCHANGED**

## Outputs

The model output and both comparison paths are actual float32 WAV files generated from the fixed fixture.

- `/Users/saiaathishkarthik/Desktop/AudioShield/evidence/speech-preserving/sepformer_speech_estimate.wav` — 64080 bytes, SHA-256 `7aa3f4e34418dfea44bc68114b71ab6d5480d84d569dee877215e67c5aa63edd`
- `/Users/saiaathishkarthik/Desktop/AudioShield/evidence/speech-preserving/sepformer_residual.wav` — 64080 bytes, SHA-256 `f5b61c1bdff5a1525dfb81baa04e01f293fe52380f7d61d971211e6361dbc88e`
- `/Users/saiaathishkarthik/Desktop/AudioShield/evidence/speech-preserving/sepformer_residual_suppressed.wav` — 64080 bytes, SHA-256 `c31acd2b76a74547733adf493c882f208565226e285af43bc4cd31fcbdcf4981`
- `/Users/saiaathishkarthik/Desktop/AudioShield/evidence/speech-preserving/global_duck_minus14db.wav` — 64080 bytes, SHA-256 `5ea218c2f21a67d7d66f1fe9c10cc0bbbceb94c9f4f6fcf2dd70562fe762ad3d`

## Measured comparison

Speech projection is the signed projection onto the clean speech stem; it includes level preservation. SI-SDR is included as a distortion-oriented secondary metric.

| Path | Speech projection (dB) | Speech SI-SDR (dB) | Dishes projection (dB) |
|---|---:|---:|---:|
| mixture | -0.00 | 3.84 | -0.01 |
| processed | -11.49 | -27.21 | 17.81 |
| globalDuck | -14.00 | 3.84 | -14.01 |
| speechEstimate | -3.21 | -21.63 | 20.60 |

- Processed speech preservation vs global duck: **2.52 dB**.
- Processed dishes projection change vs mixture: **17.82 dB** (negative would be attenuation; positive is worse).
- Processed speech SI-SDR change vs global duck: **-31.05 dB**.
- Residual attenuation: **-12.00 dB** (configured -12.0 dB).
- SepFormer CPU inference time: **803.0 ms** for the one-second fixture.

## Quality gate

- Bounded processed output (peak <= 1.0): **False**.
- Speech SI-SDR no worse than global duck: **False**.
- Dishes projection not increased: **False**.
- The run is measured evidence, not a working rescue, when any gate is false. The projection-level delta alone is insufficient because the raw SepFormer estimate is unstable on this synthetic fixture.

## Boundaries

- Offline fixture evidence only; no production wiring or browser runtime claim.
- SepFormer WHAMR is speech-vs-noise separation, not semantic dishes separation.
- Speech source selection uses the clean speech stem as an offline evaluation oracle; a production detector/policy would need a separate decision path.
- The output is float32 WAV evidence and is not a live Chrome capture result.
