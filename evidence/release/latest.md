# AudioShield release evidence

- HEAD: `c2e30aed3360d563c9402119d4bfb0a732dc116c` (audited pre-ledger commit)
- Browser smoke: **UNVERIFIED**
- Browser capability blocker: `AO_BROWSER_CAPABILITY` not set; Chrome checks not run.
- Scope: evidence only; no production source or prior test-results evidence modified.

## Gates

- `npm run build`: PASS
- `npm run typecheck`: PASS
- `npm test -- --run`: PASS — 9 files, 29 tests
- `git diff --check`: PASS
- `npm audit`: FAIL — 5 vulnerabilities (3 moderate, 1 high, 1 critical); remediation requires breaking `--force` upgrade.

## Benchmark

- Hybrid DSP: **YELLOW** — synthetic/offline benchmark only; runtime diagnostics report `metricsAvailable=false`; browser real-time behavior **UNVERIFIED**.

From `bench/results/latest.json`:

- Separator adapter: NOT_RUN / unavailable
- Detection: NOT_RUN
- Selective attenuation: NOT_RUN
- Latency: NOT_RUN
- Reliability: NOT_RUN (36 fixtures)
- Naive whole-window duck: MEASURED — 12 overlap cases; mean speech loss 20.0000000005 dB

## Artifact paths

Build produced:

`dist/manifest.json`, `dist/background.js`, `dist/background/service-worker.js`, `dist/side-panel.html`, `dist/offscreen/offscreen.html`, `dist/offscreen/offscreen.js`, `dist/offscreen/runtime.js`, `dist/ui/main.js`, `dist/ml/separator/index.js`, `dist/ml/separator/unavailable.js`, `dist/policy/trigger.js`, `dist/storage/runtime.js`, `dist/storage/settings.js`, and shared type artifacts under `dist/shared/`.

## Permissions and privacy scan

Manifest permissions: `activeTab`, `offscreen`, `storage`, `tabCapture`. Static scan found no `fetch`, XHR, WebSocket, or beacon calls. Raw audio buffers exist only as in-memory processing/test types; no raw-audio persistence or upload path found.

## Status

Automated artifact/build evidence passes except npm audit. Separator remains intentionally unavailable and browser smoke remains unverified.
