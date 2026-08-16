# Google Chrome extension capture patterns

## Provenance and license

- Repository: https://github.com/GoogleChrome/chrome-extensions-samples
- Default branch at scan: `main`
- Exact upstream HEAD: `8999a2285feec0dda615a71f12e5d7d90b897311`
- Upstream license: Apache-2.0, verified from the repository root `LICENSE` and the repository `README.md` license section at that commit.
- Local license copy: `LICENSE`
- Separate `NOTICE` file: not present in the repository at this commit.
- Model weights/checkpoints: none used or copied; `model_weight_license_status` is `NOT_REQUIRED`.

The copied JavaScript and HTML retain Google’s Apache header. Any future modified redistribution must retain the license/attribution notices and mark modified files as required by Apache-2.0.

## Curated files

The extracted sample is intentionally limited to the text/runtime files and the two icons referenced by its manifest. It is not a repository dump.

| Upstream path | Local path | Classification | Why it matters |
| --- | --- | --- | --- |
| `functional-samples/sample.tabcapture-recorder/README.md` | `extracted/functional-samples/sample.tabcapture-recorder/README.md` | `ADAPT` | Captures the intended MV3 service-worker/offscreen architecture. |
| `functional-samples/sample.tabcapture-recorder/manifest.json` | `extracted/functional-samples/sample.tabcapture-recorder/manifest.json` | `ADAPT` | Shows `tabCapture` and `offscreen` permissions and the sample’s Chrome 116 floor. |
| `functional-samples/sample.tabcapture-recorder/service-worker.js` | `extracted/functional-samples/sample.tabcapture-recorder/service-worker.js` | `ADAPT` | Coordinates action click, offscreen creation/discovery, stream-ID acquisition, and start/stop messages. |
| `functional-samples/sample.tabcapture-recorder/offscreen.js` | `extracted/functional-samples/sample.tabcapture-recorder/offscreen.js` | `ADAPT` | Runs `getUserMedia` in the offscreen document and reroutes captured audio through Web Audio. |
| `functional-samples/sample.tabcapture-recorder/offscreen.html` | `extracted/functional-samples/sample.tabcapture-recorder/offscreen.html` | `DIRECT_USE` | Minimal offscreen document shell. |
| `functional-samples/sample.tabcapture-recorder/icons/recording.png` | `extracted/functional-samples/sample.tabcapture-recorder/icons/recording.png` | `DIRECT_USE` | Keeps the copied sample manifest loadable. |
| `functional-samples/sample.tabcapture-recorder/icons/not-recording.png` | `extracted/functional-samples/sample.tabcapture-recorder/icons/not-recording.png` | `DIRECT_USE` | Keeps the copied sample manifest loadable. |

The inspected `api-samples/tabCapture/README.md`, `service-worker.js`, `receiver.js`, and `receiver.html` were not copied. They demonstrate a visible receiver tab and the older `navigator.webkitGetUserMedia` path; this is useful API context but not a suitable AudioShield offscreen runtime component.

## Capture lifecycle proven by the upstream code

1. A user action click enters the service worker through `chrome.action.onClicked`.
2. The worker calls `chrome.runtime.getContexts({})` and detects an existing `OFFSCREEN_DOCUMENT` by context type.
3. If absent, it calls `chrome.offscreen.createDocument({url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: ...})`.
4. The worker calls `chrome.tabCapture.getMediaStreamId({targetTabId: tab.id})` and sends the resulting ID to the offscreen document.
5. The offscreen document calls `navigator.mediaDevices.getUserMedia` with `chromeMediaSource: 'tab'` and the stream ID in both audio and video constraints.
6. It creates an `AudioContext`, creates a `MediaStreamAudioSourceNode`, and connects that source to `AudioContext.destination`. This explicit route is the sample’s proof-of-pattern for continuing to hear captured tab audio.
7. On stop, it stops the recorder and every stream track, then clears the state hash. The sample intentionally leaves the offscreen document open so its demo object URL remains usable; AudioShield should use a stronger lifecycle and close the document after processing stops.

The sample uses the URL hash (`#recording`) as service-worker-visible state because a service worker can be terminated. This is a useful low-bandwidth state pattern, but AudioShield should reconcile it with its existing durable/session state rather than copy it blindly.

## AudioShield adaptation boundary

The best use is the capture ingress/egress shell, not the recorder. The expected AudioShield graph is:

```text
tabCapture stream
  -> MediaStreamAudioSourceNode
  -> detector / target separator / attenuation graph
  -> AudioContext.destination
```

Required adaptation:

- Remove `MediaRecorder` and the video constraint unless video is independently required.
- Keep capture initiation in the service worker and stream consumption in the offscreen document.
- Replace the direct `source.connect(output.destination)` connection with the AudioShield processing graph. Preserve exactly one intentional output route to avoid double playback.
- Use a stable message protocol and explicit acknowledgements/errors; the upstream sample has no failure response for `getUserMedia`, stream-ID acquisition, or message delivery.
- Stop source tracks and close the `AudioContext` during shutdown, then call `chrome.offscreen.closeDocument()` when no offscreen work remains. This cleanup is an AudioShield requirement, not behavior supplied by the copied recorder.
- Preserve user-gesture and active-tab permission behavior around `chrome.action.onClicked`; the sample does not establish arbitrary background capture.

## Required technical answers

### Where each API runs

- `chrome.tabCapture.getMediaStreamId`: service worker in the copied recorder sample.
- `chrome.offscreen.createDocument`: service worker.
- `navigator.mediaDevices.getUserMedia`: offscreen document.
- `AudioContext` and `createMediaStreamSource`: offscreen document.
- `consumerTabId`: used by the separately inspected visible-receiver sample, not by `sample.tabcapture-recorder`. It is not required for the copied offscreen pattern.

### What the sample does not prove

- It does not detect semantic classes.
- It does not isolate a selected source from overlapping audio.
- It does not attenuate one source while preserving another.
- It does not prove browser support for AudioShield’s eventual ML graph, ONNX model, WebGPU, or real-time latency.
- It does not provide a robust offscreen close/reopen protocol or production error handling.

Therefore this component is a `BROWSER_CANDIDATE` for capture plumbing only. It is not a separator, detector, DSP implementation, or browser end-to-end proof for AudioShield’s semantic attenuation goal.

## File hashes at intake

These hashes are for the copied files after intake and can be compared with the pinned clone.

| Local path | SHA-256 |
| --- | --- |
| `LICENSE` | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `extracted/functional-samples/sample.tabcapture-recorder/README.md` | `11d82fa70d394e9f7d5749fa6178fbf3091c37273401549927b1e644029f9b3e` |
| `extracted/functional-samples/sample.tabcapture-recorder/manifest.json` | `ebf333595979fef2d909ad2abd8653cba5559ce8d6a2d0aa60bf4bea41c8fb3f` |
| `extracted/functional-samples/sample.tabcapture-recorder/offscreen.html` | `719dd20a5666a423f750662985313ba7c6d29ef3ffe7a909dea09c394186c541` |
| `extracted/functional-samples/sample.tabcapture-recorder/offscreen.js` | `0d45534ba62c60844952efc6f4dba22e3c8905e35594bba95498e91630b65fbc` |
| `extracted/functional-samples/sample.tabcapture-recorder/service-worker.js` | `74efcf3749eeed31211d31e49a3572e5c92ea82755c89d09578842e9bcbeb118` |
| `extracted/functional-samples/sample.tabcapture-recorder/icons/not-recording.png` | `82896c405f60af8b2db874de651a733d6bb515c975cac8d1a09ded4c094a6b94` |
| `extracted/functional-samples/sample.tabcapture-recorder/icons/recording.png` | `62c464b1f031755a189561f0a4953dd7595e67d0663503f584c0daa5f4c725a5` |

## Blockers and uncertainty

- `BLOCKED_LICENSE`: none for this repository; Apache-2.0 is verified.
- `BLOCKED_UNKNOWN` weights: none; this sample has no model artifacts.
- `UNVERIFIED`: direct Chrome execution, capture permission behavior in the current AudioShield build, and audio continuity through AudioShield’s future detector/separator graph. Those require browser testing and are not proven by static upstream inspection.
- Technical blocker: the sample’s direct source-to-destination route would bypass selective attenuation if copied unchanged. It must be replaced by the processing graph before implementation.
- Technical blocker: the copied stop path assumes a recorder exists and does not close the offscreen document; production integration needs state guards, error handling, and cleanup.
