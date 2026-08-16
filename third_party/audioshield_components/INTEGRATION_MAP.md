# AudioShield component map

Intake only. Production code unchanged.

`tabCapture -> offscreen AudioContext -> detector (YAMNet candidate) -> target-conditioned separator (Semantic Hearing / AudioSep candidates) -> selective attenuation -> recombine/output`.

- Chrome sample: capture, stream acquisition, rerouting, lifecycle reference.
- YAMNet: semantic scores/class mapping; detection only, no separation.
- Semantic Hearing: highest-priority separation candidate; validate binaural assumptions and export path.
- AudioSep: text-conditioned separation reference; likely too heavy for browser real-time.
- ONNX Runtime: WebGPU/WASM session and fallback reference.
- RNNoise: frame/DSP/gain-smoothing reference only; not semantic separation.
- Demucs/Open-Unmix: offline overlap-add/STFT/evaluation references; not default browser runtime.

Required gate before implementation: independently license every model checkpoint and benchmark browser latency/quality on mixed browser stereo.
