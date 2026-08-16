# Semantic Hearing separator lane

This directory contains an isolated intake-derived contract only. It is not
production wiring and does not bundle or download the `39.pt` checkpoint.

The checked-in Semantic Hearing source is a MIT-licensed PyTorch reference at
`07e9786c7a741f0a7c722dcde66a2679ca068c50`. Its separately hosted checkpoint
has `BLOCKED_UNKNOWN` licensing, so the lane must remain fail-closed until the
weight license is independently cleared.

The model contract is binaural stereo at 44.1 kHz with a 20-element target
vector. Its canonical labels include `speech` but do not include `dishes` or
`clatter`; this lane therefore refuses an implicit AudioShield trigger
mapping. See `model-tools/semantic-hearing/feasibility.mjs` and
`evidence/semantic-hearing/latest.md` for the reproducible feasibility result.
