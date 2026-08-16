#!/usr/bin/env python3
"""Offline Worker C experiment for the licensed SpeechBrain WHAMR checkpoint.

This deliberately lives outside production code. It uses a fixed local fixture,
downloads only the pinned Apache-2.0 model revision into /tmp, and writes
reproducible evidence WAVs plus measurements under evidence/speech-preserving.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


MODEL_ID = "speechbrain/sepformer-whamr16k"
MODEL_REVISION = "21a5b500c6f52fddc387c5d9e5fb13ffd6f039c5"
MODEL_LICENSE = "Apache-2.0"
MODEL_SAMPLE_RATE = 16_000
GLOBAL_DUCK_DB = -14.0
RESIDUAL_ATTENUATION_DB = -12.0


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(signal, dtype=np.float64))))


def db(value: float) -> float:
    return 20.0 * math.log10(max(abs(value), 1e-12))


def projection_db(signal: np.ndarray, reference: np.ndarray) -> float:
    """Signed-source projection level relative to the clean reference."""
    denominator = float(np.dot(reference, reference))
    if denominator <= 1e-12:
        return float("nan")
    coefficient = float(np.dot(signal, reference)) / denominator
    return db(coefficient)


def si_sdr(signal: np.ndarray, reference: np.ndarray) -> float:
    reference_energy = float(np.dot(reference, reference))
    if reference_energy <= 1e-12:
        return float("nan")
    target = (float(np.dot(signal, reference)) / reference_energy) * reference
    error = signal - target
    return 10.0 * math.log10(max(float(np.dot(target, target)), 1e-12) / max(float(np.dot(error, error)), 1e-12))


def mono_at_16k(path: Path) -> np.ndarray:
    audio, sample_rate = sf.read(path, always_2d=True, dtype="float32")
    mono = np.mean(audio, axis=1, dtype=np.float64)
    if sample_rate != MODEL_SAMPLE_RATE:
        mono = resample_poly(mono, MODEL_SAMPLE_RATE, sample_rate)
    return mono.astype(np.float32)


def align(*signals: np.ndarray) -> tuple[np.ndarray, ...]:
    length = min(signal.shape[0] for signal in signals)
    return tuple(signal[:length].astype(np.float32, copy=False) for signal in signals)


def write_float_wav(path: Path, signal: np.ndarray) -> dict[str, object]:
    signal = np.asarray(signal, dtype=np.float32)
    sf.write(path, signal, MODEL_SAMPLE_RATE, subtype="FLOAT", format="WAV")
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "sampleRateHz": MODEL_SAMPLE_RATE,
        "channels": 1,
        "frames": int(signal.shape[0]),
        "peak": float(np.max(np.abs(signal))),
        "rms": rms(signal),
    }


def model_files(model_dir: Path) -> list[dict[str, object]]:
    return [
        {
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for path in sorted(model_dir.iterdir())
        if path.is_file() and path.name != "README.md"
    ]


def load_model(model_dir: Path):
    from speechbrain.inference.separation import SepformerSeparation

    return SepformerSeparation.from_hparams(
        source=str(model_dir),
        savedir=str(model_dir),
        run_opts={"device": "cpu"},
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--fixture", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--model-cache", type=Path, default=Path("/tmp/audioshield-speechbrain/sepformer-whamr16k"))
    args = parser.parse_args()

    repo = args.repo.resolve()
    fixture = (args.fixture or repo / "evidence/semantic-hearing/fixture").resolve()
    output = (args.output or repo / "evidence/speech-preserving").resolve()
    output.mkdir(parents=True, exist_ok=True)
    args.model_cache.parent.mkdir(parents=True, exist_ok=True)

    required = [fixture / name for name in ("speech.wav", "dishes.wav", "mixture.wav")]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"fixed fixture files missing: {missing}")

    # Resolve the exact Hub revision before downloading. The model card metadata
    # and revision are part of the evidence; no unpinned 'latest' checkpoint is used.
    from huggingface_hub import HfApi, snapshot_download

    info = HfApi().model_info(MODEL_ID, revision=MODEL_REVISION, files_metadata=True)
    card_license = (info.card_data or {}).get("license") if info.card_data else None
    if info.sha != MODEL_REVISION:
        raise RuntimeError(f"Hub revision moved: expected {MODEL_REVISION}, got {info.sha}")
    if card_license != "apache-2.0":
        raise RuntimeError(f"model card license is not apache-2.0: {card_license!r}")
    snapshot_download(
        repo_id=MODEL_ID,
        revision=MODEL_REVISION,
        local_dir=str(args.model_cache),
        allow_patterns=["*.yaml", "*.json", "*.ckpt"],
    )

    speech, dishes, mixture = (mono_at_16k(path) for path in required)
    speech, dishes, mixture = align(speech, dishes, mixture)
    sf.write(output / "fixture_mixture_16k_mono.wav", mixture, MODEL_SAMPLE_RATE, subtype="FLOAT", format="WAV")

    model = load_model(args.model_cache)
    import torch

    with torch.no_grad():
        started = time.perf_counter()
        estimated = model.separate_batch(torch.from_numpy(mixture).unsqueeze(0))
        inference_ms = (time.perf_counter() - started) * 1000.0
    estimates = estimated.detach().cpu().numpy()
    if estimates.ndim != 3 or estimates.shape[0] != 1 or estimates.shape[2] != 2:
        raise RuntimeError(f"unexpected SepFormer output shape: {estimates.shape}")
    sources = estimates[0].astype(np.float32)
    source_a, source_b = align(sources[:, 0], sources[:, 1])
    speech, dishes, mixture, source_a, source_b = align(speech, dishes, mixture, source_a, source_b)

    correlations = [
        abs(float(np.corrcoef(candidate, speech)[0, 1]))
        for candidate in (source_a, source_b)
    ]
    speech_index = int(np.argmax(correlations))
    speech_estimate = (source_a, source_b)[speech_index]
    residual = mixture - speech_estimate
    residual_gain = 10.0 ** (RESIDUAL_ATTENUATION_DB / 20.0)
    processed = speech_estimate + residual_gain * residual
    global_duck = mixture * (10.0 ** (GLOBAL_DUCK_DB / 20.0))

    wavs = {
        "speechEstimate": write_float_wav(output / "sepformer_speech_estimate.wav", speech_estimate),
        "residual": write_float_wav(output / "sepformer_residual.wav", residual),
        "processed": write_float_wav(output / "sepformer_residual_suppressed.wav", processed),
        "globalDuck": write_float_wav(output / "global_duck_minus14db.wav", global_duck),
    }

    def metrics(signal: np.ndarray) -> dict[str, float]:
        return {
            "speechProjectionDb": projection_db(signal, speech),
            "speechSiSdrDb": si_sdr(signal, speech),
            "dishesProjectionDb": projection_db(signal, dishes),
            "dishesSiSdrDb": si_sdr(signal, dishes),
            "rmsDbfs": db(rms(signal)),
        }

    metric_values = {
        "mixture": metrics(mixture),
        "processed": metrics(processed),
        "globalDuck": metrics(global_duck),
        "speechEstimate": metrics(speech_estimate),
        "residual": metrics(residual),
    }
    metric_values["processed"]["speechPreservationVsGlobalDuckDb"] = (
        metric_values["processed"]["speechProjectionDb"]
        - metric_values["globalDuck"]["speechProjectionDb"]
    )
    metric_values["processed"]["dishesProjectionChangeVsMixtureDb"] = (
        metric_values["processed"]["dishesProjectionDb"]
        - metric_values["mixture"]["dishesProjectionDb"]
    )
    metric_values["processed"]["speechSiSdrDeltaVsGlobalDuckDb"] = (
        metric_values["processed"]["speechSiSdrDb"]
        - metric_values["globalDuck"]["speechSiSdrDb"]
    )
    metric_values["processed"]["residualAttenuationDb"] = db(rms(residual_gain * residual) / rms(residual))

    quality_gate = {
        "boundedOutput": max(item["peak"] for item in wavs.values() if item["path"].endswith("suppressed.wav")) <= 1.0,
        "speechSiSdrNotWorseThanGlobalDuck": metric_values["processed"]["speechSiSdrDeltaVsGlobalDuckDb"] >= 0.0,
        "dishesProjectionNotIncreased": metric_values["processed"]["dishesProjectionChangeVsMixtureDb"] <= 0.0,
    }
    quality_pass = all(quality_gate.values())

    report = {
        "schemaVersion": 1,
        "generatedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PASS" if quality_pass else "MEASURED",
        "verdict": "WORKING_RESCUE" if quality_pass else "QUALITY_BLOCKED",
        "lane": "speech-preserving-fallback",
        "productionWiring": "UNCHANGED",
        "model": {
            "id": MODEL_ID,
            "revision": MODEL_REVISION,
            "sha": info.sha,
            "license": MODEL_LICENSE,
            "modelCardLicense": card_license,
            "sampleRateHz": MODEL_SAMPLE_RATE,
            "runtime": "SpeechBrain 1.1.0 / PyTorch CPU",
            "files": model_files(args.model_cache),
        },
        "fixture": {
            "id": "semantic-hearing-speech-dishes-v1",
            "sourceDirectory": str(fixture),
            "inputSampleRateHz": 44100,
            "modelInput": "mono downsampled to 16 kHz with scipy.signal.resample_poly",
            "sourceFiles": {name: {"path": str(path), "sha256": sha256_file(path)} for name, path in zip(("speech", "dishes", "mixture"), required)},
        },
        "processing": {
            "speechSourceIndex": speech_index,
            "sourceSelection": "offline oracle: highest absolute correlation with clean speech stem",
            "residualFormula": "mixture - selected SepFormer speech estimate",
            "residualAttenuationDb": RESIDUAL_ATTENUATION_DB,
            "globalDuckDb": GLOBAL_DUCK_DB,
            "inferenceMs": inference_ms,
        },
        "metrics": metric_values,
        "qualityGate": quality_gate,
        "outputs": wavs,
        "limits": [
            "Offline fixture evidence only; no production wiring or browser runtime claim.",
            "SepFormer WHAMR is speech-vs-noise separation, not semantic dishes separation.",
            "Speech source selection uses the clean speech stem as an offline evaluation oracle; a production detector/policy would need a separate decision path.",
            "The output is float32 WAV evidence and is not a live Chrome capture result.",
        ],
    }
    (output / "latest.json").write_text(json.dumps(report, indent=2) + "\n")
    markdown = [
        "# Speech-preserving fallback evidence",
        "",
        f"- Verdict: **{report['verdict']}**",
        f"- Status: **{report['status']}**",
        f"- Model: `{MODEL_ID}@{MODEL_REVISION}`",
        f"- Model artifact license: **{MODEL_LICENSE}** (Hub card metadata: `{card_license}`)",
        "- Production wiring: **UNCHANGED**",
        "",
        "## Outputs",
        "",
        "The model output and both comparison paths are actual float32 WAV files generated from the fixed fixture.",
        "",
        *[f"- `{item['path']}` — {item['bytes']} bytes, SHA-256 `{item['sha256']}`" for item in wavs.values()],
        "",
        "## Measured comparison",
        "",
        "Speech projection is the signed projection onto the clean speech stem; it includes level preservation. SI-SDR is included as a distortion-oriented secondary metric.",
        "",
        "| Path | Speech projection (dB) | Speech SI-SDR (dB) | Dishes projection (dB) |",
        "|---|---:|---:|---:|",
        *[
            f"| {name} | {values['speechProjectionDb']:.2f} | {values['speechSiSdrDb']:.2f} | {values['dishesProjectionDb']:.2f} |"
            for name, values in metric_values.items()
            if name in ("mixture", "processed", "globalDuck", "speechEstimate")
        ],
        "",
        f"- Processed speech preservation vs global duck: **{metric_values['processed']['speechPreservationVsGlobalDuckDb']:.2f} dB**.",
        f"- Processed dishes projection change vs mixture: **{metric_values['processed']['dishesProjectionChangeVsMixtureDb']:.2f} dB** (negative would be attenuation; positive is worse).",
        f"- Processed speech SI-SDR change vs global duck: **{metric_values['processed']['speechSiSdrDeltaVsGlobalDuckDb']:.2f} dB**.",
        f"- Residual attenuation: **{metric_values['processed']['residualAttenuationDb']:.2f} dB** (configured {RESIDUAL_ATTENUATION_DB:.1f} dB).",
        f"- SepFormer CPU inference time: **{inference_ms:.1f} ms** for the one-second fixture.",
        "",
        "## Quality gate",
        "",
        f"- Bounded processed output (peak <= 1.0): **{quality_gate['boundedOutput']}**.",
        f"- Speech SI-SDR no worse than global duck: **{quality_gate['speechSiSdrNotWorseThanGlobalDuck']}**.",
        f"- Dishes projection not increased: **{quality_gate['dishesProjectionNotIncreased']}**.",
        "- The run is measured evidence, not a working rescue, when any gate is false. The projection-level delta alone is insufficient because the raw SepFormer estimate is unstable on this synthetic fixture.",
        "",
        "## Boundaries",
        "",
        *[f"- {limit}" for limit in report["limits"]],
        "",
    ]
    (output / "latest.md").write_text("\n".join(markdown))
    print(json.dumps({"status": report["status"], "verdict": report["verdict"], "inferenceMs": inference_ms, "output": str(output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
