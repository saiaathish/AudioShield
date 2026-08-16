# Speech-preserving fallback

This is an offline Worker C experiment only. It does not wire a model into
AudioShield production code.

The runner uses the official `speechbrain/sepformer-whamr16k` checkpoint at
revision `21a5b500c6f52fddc387c5d9e5fb13ffd6f039c5`. The Hugging Face model
card declares `apache-2.0`; the checkpoint is downloaded into `/tmp`, never
vendored into this repository.

Run from the repository root:

```sh
python3 rescue/speech-preserving/run_sepformer_whamr.py
```

The fixed input is the existing deterministic fixture at
`evidence/semantic-hearing/fixture/`. Outputs and measured evidence are
written only under `evidence/speech-preserving/`.

The experiment estimates speech with the SepFormer output that has the highest
offline correlation with the clean speech stem, computes `residual = mixture -
speechEstimate`, and attenuates that residual by 12 dB. This clean-stem choice
is an evaluation oracle, not production wiring. The report compares this path
with a -14 dB whole-mixture global duck and must not be described as semantic
dishes separation.
