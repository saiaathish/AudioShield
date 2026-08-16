"""Offline AudioSep-hive target/residual benchmark for the fixed speech+dishes fixture.

This is evidence tooling only. It does not wire the extension or claim real-time
browser support. The model target is treated as an estimate of the queried
sound; the residual is mixture minus that estimate.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf


def read_mono(path: Path, sample_rate: int) -> np.ndarray:
    data, rate = sf.read(path, always_2d=True, dtype="float32")
    mono = data.mean(axis=1)
    if rate == sample_rate:
        return mono
    old_x = np.linspace(0.0, 1.0, len(mono), endpoint=False)
    new_len = round(len(mono) * sample_rate / rate)
    new_x = np.linspace(0.0, 1.0, new_len, endpoint=False)
    return np.interp(new_x, old_x, mono).astype(np.float32)


def si_sdr(reference: np.ndarray, estimate: np.ndarray) -> float:
    reference = reference - reference.mean()
    estimate = estimate - estimate.mean()
    projection = np.dot(estimate, reference) / max(np.dot(reference, reference), 1e-12)
    target = projection * reference
    error = estimate - target
    return float(10.0 * np.log10(max(np.dot(target, target), 1e-12) / max(np.dot(error, error), 1e-12)))


def gain_db(value: float) -> float:
    return float(20.0 * np.log10(max(abs(value), 1e-12)))


def component_gains(signal: np.ndarray, speech: np.ndarray, dishes: np.ndarray) -> dict[str, float]:
    design = np.column_stack([speech, dishes])
    coefficients, _, _, _ = np.linalg.lstsq(design, signal, rcond=None)
    residual = signal - design @ coefficients
    return {
        "speechAmplitudeGain": float(coefficients[0]),
        "speechGainDb": gain_db(float(coefficients[0])),
        "dishesAmplitudeGain": float(coefficients[1]),
        "dishesGainDb": gain_db(float(coefficients[1])),
        "unexplainedResidualRms": float(np.sqrt(np.mean(residual**2))),
    }


def write(path: Path, signal: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.clip(signal, -1.0, 1.0), sample_rate, subtype="PCM_16")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--speech", type=Path, required=True)
    parser.add_argument("--dishes", type=Path, required=True)
    parser.add_argument("--mixture", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--sample-rate", type=int, default=32000)
    parser.add_argument("--attenuation-db", type=float, default=-14.0)
    args = parser.parse_args()

    speech = read_mono(args.speech, args.sample_rate)
    dishes = read_mono(args.dishes, args.sample_rate)
    mixture = read_mono(args.mixture, args.sample_rate)
    target, target_rate = sf.read(args.target, always_2d=True, dtype="float32")
    target = target.mean(axis=1)
    if target_rate != args.sample_rate:
        raise ValueError(f"target sample rate {target_rate} != {args.sample_rate}")
    length = min(len(speech), len(dishes), len(mixture), len(target))
    speech, dishes, mixture, target = (x[:length] for x in (speech, dishes, mixture, target))

    residual = mixture - target
    target_gain = 10.0 ** (args.attenuation_db / 20.0)
    processed = residual + target_gain * target
    global_duck = 10.0 ** (args.attenuation_db / 20.0) * mixture
    write(args.output_dir / "residual-speech.wav", residual, args.sample_rate)
    write(args.output_dir / "processed-mixture.wav", processed, args.sample_rate)
    write(args.output_dir / "global-duck.wav", global_duck, args.sample_rate)

    report = {
        "schemaVersion": 1,
        "status": "MEASURED",
        "sampleRateHz": args.sample_rate,
        "durationSeconds": length / args.sample_rate,
        "query": "dishes clattering",
        "targetEstimate": "AudioSep-hive query output",
        "attenuationDb": args.attenuation_db,
        "targetEstimateVsDishesSiSdrDb": si_sdr(dishes, target),
        "residualSpeechVsSpeechSiSdrDb": si_sdr(speech, residual),
        "mixtureVsSpeechSiSdrDb": si_sdr(speech, mixture),
        "processed": component_gains(processed, speech, dishes),
        "globalDuck": component_gains(global_duck, speech, dishes),
        "targetEstimateRms": float(np.sqrt(np.mean(target**2))),
        "mixtureRms": float(np.sqrt(np.mean(mixture**2))),
        "speechRms": float(np.sqrt(np.mean(speech**2))),
        "dishesRms": float(np.sqrt(np.mean(dishes**2))),
        "outputs": {
            "target": str(args.target),
            "residual": str(args.output_dir / "residual-speech.wav"),
            "processed": str(args.output_dir / "processed-mixture.wav"),
            "globalDuck": str(args.output_dir / "global-duck.wav"),
        },
        "limits": [
            "Synthetic deterministic 1-second fixture; not real-browser or live-tab proof.",
            "Target estimate is query-conditioned output; residual is mixture minus estimate.",
            "The measured processed path attenuates the model estimate by the configured gain and may affect non-target leakage.",
        ],
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
