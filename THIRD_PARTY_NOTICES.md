# Third-party notices

AudioShield keeps its realtime audio processing local to the browser. The following open-source components are used in the packaged sensory engine.

## @sapphi-red/web-noise-suppressor 0.4.0

- Project: https://github.com/sapphi-red/web-noise-suppressor
- License: MIT
- Copyright (c) 2022 翠 / green
- AudioShield uses its AudioWorklet/WASM integration for GTCRN and RNNoise. Runtime assets are copied into the extension package; no CDN or remote executable code is used.

## GTCRN

- Project: https://github.com/Xiaobin-Rong/gtcrn
- License: MIT
- Copyright (c) 2024 Rong Xiaobin
- AudioShield uses GTCRN through the packaged web-noise-suppressor integration as its preferred local speech-noise reduction engine.

## RNNoise

- Project: https://github.com/xiph/rnnoise
- License: BSD-3-Clause
- AudioShield uses RNNoise through the packaged web-noise-suppressor integration as the neural fallback when GTCRN cannot initialize.

These neural denoisers are used for speech-first background-noise reduction. AudioShield's alarm/high-tone, harsh-high, transient/clatter, applause/crowd-burst, and sudden-loudness controls are implemented with browser-native Web Audio analysis, filters, gain control, and dynamics processing. AudioShield does not claim that these perceptual controls are arbitrary semantic source separation.
