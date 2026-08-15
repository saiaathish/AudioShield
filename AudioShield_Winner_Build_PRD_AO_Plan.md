# AudioShield — Winner-Build PRD + Agent Orchestrator Execution Plan

**Project:** AudioShield  
**Hackathon:** CS Girlies Annual Hackathon — Technology for Wellness  
**Primary track:** Health  
**Bonus target:** Best Use of AI, only if the implementation and disclosure requirements are satisfied  
**Build window:** 48 hours  
**Document purpose:** Internal build specification. This is not submission copy.  
**Status:** P0 winner-build specification  
**Owner:** Sai / team  
**Execution model:** Agent Orchestrator (AO) with disjoint worker ownership and proof-gated integration

> **Important hackathon compliance note:** The hackathon explicitly says the final project description and documentation should be written by the team without AI-generated copy. Do **not** paste this PRD, worker outputs, or AI-written prose into the Devpost description or final README. Use this document only to plan and build. Have the team write the final documentation from scratch using facts and measurements produced by the system.

---

# 0. Executive Verdict

AudioShield is a Chrome extension that gives people control over **which semantic sounds inside browser media they want softened**, instead of forcing them to reduce the volume of everything.

The winner version is not a glorified volume ducking extension.

The winner version must prove:

1. A real browser tab is captured after an explicit user action.
2. Audio is processed locally.
3. Trigger sounds are detected in real time.
4. Selected trigger sounds are selectively attenuated.
5. Speech or another protected sound remains substantially more intact than the trigger.
6. The system works when trigger audio and speech **overlap**.
7. The UI shows what AudioShield heard and what it changed.
8. The extension exposes an immediate bypass.
9. The team has measurements, not adjectives.
10. The demo shows the result live in under 30 seconds.

The product claim is:

> **AudioShield is a browser accessibility layer that lets users soften specific sound categories in online media while preserving the sounds they still want to hear.**

The defensible novelty is **not** “semantic sound suppression has never existed.” It has prior research.

The defensible product delta is:

> **AudioShield turns selective auditory filtering into a zero-account, browser-native accessibility workflow with per-trigger controls, local processing, persistent site preferences, and a visible Sensory X-Ray showing what was detected and attenuated.**

---

# 1. Hackathon Rubric → Product Strategy

The official judging criteria are:

- Wellness Impact
- Creativity & Innovation
- Technical Craft & Execution
- Design & User Experience
- Community & Accessibility

No official numerical weights are published. Internally, treat all five as equally dangerous: a visible failure on any one can remove the project from overall-win contention.

## 1.1 Wellness Impact

AudioShield must make the user outcome obvious:

> “I can consume browser media without being forced to hear certain trigger sounds at full intensity.”

Required evidence:

- At least one real user observation or quote if available.
- A before/after listening demo.
- A measurable attenuation result.
- No unsupported medical efficacy claims.

Never claim:

- “Treats autism.”
- “Reduces sensory overload by X%.”
- “Clinically improves auditory hypersensitivity.”
- “Medical-grade.”

Allowed framing:

- “Designed for people who experience sound sensitivity.”
- “Gives users more control over browser audio.”
- “Can reduce the level of selected trigger sounds in supported media.”

## 1.2 Creativity & Innovation

Prior art exists in selective sound attenuation and semantic hearing.

The project must win creativity through productization:

- Browser-native.
- Zero account.
- Local-first audio processing.
- Per-trigger rules.
- Persistent site-level sensory profiles.
- Sensory X-Ray timeline.
- A/B segment replay.
- Accessibility-first interaction instead of research-lab controls.

## 1.3 Technical Craft & Execution

The technical score is earned by the hard path:

`tab capture → streaming audio → sound detection → target attenuation/separation → low-latency playback → live visualization → benchmarks`

The build must not fake selective attenuation by only reducing the entire waveform whenever a classifier fires.

A temporary full-window ducking fallback may exist behind a development flag, but it cannot power the final winner claim.

## 1.4 Design & UX

The product must feel like an accessibility tool, not an audio workstation.

A user should understand it in seconds:

1. Click AudioShield.
2. Turn on protection for this tab.
3. Select sounds to soften.
4. Choose strength.
5. Continue watching.

Advanced technical information belongs in Sensory X-Ray, not the primary control surface.

## 1.5 Community & Accessibility

P0:

- Keyboard operable.
- Screen-reader labels.
- High-contrast-safe UI.
- Reduced-motion respect.
- No required account.
- No cloud/API key.
- No terminal.
- No medical diagnosis.
- Privacy status shown clearly.
- One-click bypass.

---

# 2. Target User

## 2.1 Primary User

A person who experiences discomfort, distraction, or difficulty from specific sounds in online media and currently solves the problem by:

- muting the entire tab,
- lowering all volume,
- skipping sections,
- leaving the video,
- manually scrubbing,
- avoiding content.

The user should not need to identify with a diagnosis to use the product.

## 2.2 Secondary Users

- Users with migraine-related sound sensitivity.
- Users who dislike sudden alarms or applause in media.
- Users who want lower-intensity browser media.
- Users who need speech preserved while non-speech events are softened.

## 2.3 User Reality Test

First 60 seconds:

1. Install unpacked extension or production build.
2. Open supported browser media.
3. Click extension action.
4. Click **Protect this tab**.
5. Select one or more trigger categories.
6. Continue playback.

No account.  
No cloud console.  
No API key.  
No payment.  
No IDE.  
No developer setup after installation.

---

# 3. Problem Statement

Current browser volume controls are coarse.

If a video contains:

- dialogue the user wants,
- clattering dishes they do not,
- a sudden alarm,
- applause,

the browser exposes one volume control for the entire mixture.

Traditional noise suppression products often optimize around speech calls or remove broad “background noise.” AudioShield’s product goal is different:

> Give the listener semantic control over specific sound events in media they consume.

---

# 4. Prior Art and Defensible Delta

The team must assume a technical judge can find prior work.

Relevant prior art includes:

- **Sona: Real-Time Multi-Target Sound Attenuation for Noise Sensitivity (2026)** — target-conditioned, on-device, multi-target attenuation for noise-sensitive users.
- **Semantic Hearing: Programming Acoustic Scenes with Binaural Hearables (UIST 2023)** — real-time target sound extraction for semantic sound classes; open-source implementation/checkpoint exists.
- **YAMNet / AudioSet-based sound event classification** — broad semantic event detection.

## 4.1 One-Sentence Delta

Use internally:

> AudioShield is a browser-native accessibility layer that applies user-specific semantic sound rules to arbitrary supported tab media, keeps processing local, persists site preferences, and makes every detection and attenuation visible through a live Sensory X-Ray.

## 4.2 What We Are Not Claiming

- We invented semantic hearing.
- We invented target-conditioned source separation.
- We invented noise sensitivity tooling.
- We are clinically validated.
- We support every website and sound class.

---

# 5. Product Goals

## G1 — Immediate Utility

A user can protect a tab in less than 60 seconds.

## G2 — Real Selective Attenuation

On overlapping test mixtures, selected trigger audio must be measurably reduced while protected speech remains measurably better preserved than a naive whole-window volume duck.

## G3 — Local-First Privacy

Raw tab audio must never be intentionally uploaded to an application server in the P0 build.

## G4 — Explainability

The UI shows:

- detected sound,
- confidence,
- attenuation action,
- time range,
- bypass state.

No hidden “AI magic.”

## G5 — Robust Demo

The demo must survive:

- pause/resume,
- toggling categories,
- turning AudioShield off/on,
- unsupported or silent tab,
- capture ending,
- classifier uncertainty.

## G6 — Evidence

The repository must produce a benchmark artifact containing real measured values.

---

# 6. Non-Goals

Cut these unless every P0 acceptance criterion is green.

- Mobile app.
- Safari/Firefox support.
- User accounts.
- Cloud sync.
- Social features.
- Wellness scoring.
- Therapy chatbot.
- LLM assistant.
- Medical diagnosis.
- Custom model training from scratch.
- More than 3–5 polished trigger categories.
- Universal arbitrary text-prompt sound separation.
- Environmental microphone processing.
- Full audio editor.
- Automatic per-user clinical personalization.
- 30+ settings.
- Analytics SaaS dashboard.

---

# 7. P0 / P1 / P2 Scope

## 7.1 P0 — Winner Build

P0 must ship.

### Extension Runtime
- Manifest V3.
- `tabCapture`.
- Offscreen document for audio processing/playback.
- Local extension storage.
- Minimal permissions.
- Current-tab protection start/stop.
- Capture state recovery.

### Audio
- Capture current tab audio.
- Re-route captured audio to output so user still hears the tab.
- Process audio through a defined real-time pipeline.
- Detect at least 3 supported semantic trigger categories.
- Preserve speech as the default protected category.
- Apply selective attenuation.
- Support overlapping speech + trigger fixture.
- One-click bypass.
- Avoid audible clipping.
- Avoid runaway gain.

### Initial Trigger Set
Final classes depend on model support. Target:

- alarm / siren,
- dishes / cutlery / clatter,
- applause.

Optional fourth:

- chewing / mastication,

only if detection and separation performance are credible.

### Controls
- Protect this tab.
- Trigger toggles.
- Per-trigger strength.
- Global protection strength.
- Speech-preserve indicator.
- Bypass.
- Reset.

### Sensory X-Ray
- Live horizontal timeline.
- Sound label.
- confidence.
- attenuation amount.
- protected vs softened visual distinction.
- last ~20–30 seconds retained in memory only.
- click segment to inspect details.
- A/B replay if technically stable.

### Privacy
- “Audio stays on this device” state in UI.
- No raw audio telemetry.
- No account.
- No unnecessary host permissions.

### Measurement
- Detection benchmark.
- Overlap attenuation benchmark.
- speech-preservation benchmark.
- p50/p95 processing latency.
- failure count over repeat runs.

### Error States
- No active media.
- Capture permission unavailable.
- Unsupported environment.
- Model load failure.
- Processing overload.
- Capture ended.
- Tab navigated/reloaded.
- WebGPU unavailable → fallback runtime if possible.

## 7.2 P1 — Only After P0 Green

- Site-level sensory profiles.
- Presets: Gentle / Balanced / Strong.
- More trigger classes.
- A/B replay from timeline.
- “Learn this site” preference shortcut.
- Import/export local profile.
- Lightweight onboarding.
- Browser side panel instead of popup-only details.

## 7.3 P2 — Submission-Night Cut Candidates

- Custom user sound examples.
- WebGPU optimization beyond what metrics require.
- Fancy animations.
- Theming beyond one excellent default.
- Advanced model selector.
- Per-site statistics.
- Cross-device sync.

---

# 8. Core User Flows

## 8.1 First-Time Flow

1. User installs extension.
2. User opens a media tab.
3. User clicks AudioShield.
4. UI says:
   - `Protection: Off`
   - `Audio processing: On-device`
5. User selects:
   - Alarm
   - Dishes
   - Applause
6. User clicks **Protect this tab**.
7. Extension begins capture.
8. Model initializes.
9. UI changes to:
   - `Protected`
   - live sound status.
10. User closes popup.
11. Processing continues through offscreen runtime.
12. User can re-open controls without resetting the pipeline.

Acceptance:
- No account or setup wizard blocks the flow.
- First usable protection state reached in <=60 seconds after installation, excluding model download if bundled installation already includes models.

## 8.2 Trigger Detected Flow

1. Classifier receives current audio frame/window.
2. Detector returns category + confidence.
3. Policy checks:
   - category selected?
   - confidence over threshold?
   - attenuation strength?
4. Separation/attenuation engine applies action.
5. Processed audio is played.
6. Sensory X-Ray receives event:
   - timestamp,
   - category,
   - confidence,
   - action,
   - dB target.
7. UI renders event.

## 8.3 Bypass Flow

1. User clicks **Bypass**.
2. Processed output stops affecting audio.
3. Original captured tab audio routes to destination.
4. UI clearly indicates `Bypassed`.
5. State change takes effect immediately.

Target:
- perceptible switch <=100 ms where architecture allows.

## 8.4 Capture Failure Flow

1. Stream ends or throws.
2. Audio engine fails open to normal tab playback where possible.
3. UI shows a clear non-scary error.
4. User can restart protection.
5. No infinite retry loop.

## 8.5 Unsupported Runtime Flow

If WebGPU is unavailable:

1. Attempt WASM/CPU fallback if model is supported.
2. If the separator cannot meet real-time requirements:
   - show unsupported performance state,
   - do not silently fake target separation,
   - allow demo/development smart-duck mode only behind an explicit dev flag.

---

# 9. Functional Requirements

## FR-001 — Tab Protection Activation

**Input:** user clicks Protect this tab.

System must:

- validate active tab,
- start capture only from a user gesture path,
- create/reuse offscreen document,
- obtain stream,
- initialize processing graph,
- begin output,
- persist tab session metadata.

Acceptance:

- protection begins without opening an extra visible tab.
- user continues hearing audio.

## FR-002 — Audio Playback Preservation

When tab audio is captured, Chrome no longer automatically plays it to the user.

The offscreen processor must explicitly re-route the captured stream to an output destination.

Acceptance:

- with processing bypassed, A/B audio is perceptually equivalent to the original for the demo fixture.
- no double playback.

## FR-003 — Trigger Selection

Each trigger profile contains:

```ts
type TriggerRule = {
  id: string;
  enabled: boolean;
  attenuationDb: number;
  detectorThreshold: number;
};
```

P0 defaults:

- disabled until selected,
- safe attenuation ranges,
- no boost above original signal level.

## FR-004 — Sound Detection

Detector contract:

```ts
type SoundDetection = {
  classId: string;
  label: string;
  confidence: number;
  startedAtMs: number;
  endedAtMs: number;
};
```

Requirements:

- streaming-safe.
- deterministic threshold application.
- debounced/hysteresis behavior to avoid flicker.
- label mapping isolated from model internals.
- detect speech as a protected semantic signal when supported.

## FR-005 — Attenuation Policy

Policy must decide:

- suppress target?
- preserve?
- do nothing?
- fallback?

Contract:

```ts
type AttenuationDecision = {
  targetClassId: string;
  active: boolean;
  requestedDb: number;
  confidence: number;
  reason: "selected-trigger" | "below-threshold" | "bypass" | "unsupported";
};
```

## FR-006 — True Separation Winner Path

The final winner claim requires a target-conditioned separation or masking path that can reduce a selected overlapping source more selectively than full-window volume ducking.

The implementation may use an open-source pretrained model if license and attribution are handled correctly.

Preferred exploration order:

1. Evaluate the open-source **Semantic Hearing** checkpoint and architecture for adaptation/ONNX export.
2. If unsuitable for browser tab stereo, evaluate a smaller target/universal separator that can be converted to ONNX.
3. Run in ONNX Runtime Web using WebGPU when available.
4. Keep a CPU/WASM fallback only if it remains usable.

**Hard rule:** never claim overlapping source preservation if the final output is produced only by lowering the gain of the entire mixture.

## FR-007 — Development Smart-Duck Fallback

A development-only engine may use:

`classifier → policy → gain envelope`

Purpose:

- validate tab capture,
- UI,
- state,
- timeline,
- test harness before the separator lands.

Must be:

- clearly labeled `DEV_DUCK_ENGINE`,
- off by default in release build,
- blocked from winner demo,
- excluded from benchmark claims about selective source preservation.

## FR-008 — Sensory X-Ray

Each event:

```ts
type SensoryEvent = {
  id: string;
  startedAtMs: number;
  endedAtMs: number;
  label: string;
  confidence: number;
  attenuationDb: number;
  protected: boolean;
  engine: "separator" | "duck" | "bypass";
};
```

UI must display:

- relative time,
- category,
- action,
- confidence,
- protected/softened status.

Retention:

- in-memory ring buffer for P0.
- no raw audio persistence required.

## FR-009 — A/B Inspection

If stable:

- click a recent segment.
- user can switch Original / Protected for the short segment.

If replay requires raw audio persistence that complicates privacy or latency, CUT it before compromising P0.

Sensory X-Ray without replay is still P0.

## FR-010 — Persistent Preferences

Store only configuration:

- enabled trigger rules,
- strength,
- optional site profile,
- UI preferences.

Do not persist raw audio.

## FR-011 — Privacy Indicator

The UI must explicitly state:

- processing location: device,
- active capture tab,
- whether raw audio is stored: no.

Never use fake “HIPAA compliant” language.

## FR-012 — Kill Switch

Global bypass must:

- work from popup/side panel.
- revert processing immediately.
- be keyboard accessible.

---

# 10. Technical Architecture

## 10.1 Technology Stack

Recommended:

- TypeScript.
- React for extension UI.
- Vite or equivalent extension-friendly bundler.
- Manifest V3.
- Chrome `tabCapture`.
- Chrome `offscreen`.
- Chrome `storage`.
- Web Audio API.
- AudioWorklet where needed for low-latency DSP.
- ONNX Runtime Web for browser inference when model export is feasible.
- WebGPU primary execution provider.
- WASM fallback where practical.
- Vitest for unit tests.
- Playwright or a Chrome-extension E2E harness for supported integration tests.
- Python only for offline model conversion/benchmark tooling, never required by end users.

## 10.2 Runtime Components

### A. Service Worker

Responsibilities:

- user-action orchestration.
- active tab identity.
- offscreen lifecycle.
- stream ID acquisition.
- state recovery.
- messaging.
- no heavy DSP.

### B. Offscreen Audio Runtime

Responsibilities:

- receive stream ID.
- call `getUserMedia` using tab stream constraints.
- create AudioContext.
- instantiate processing graph.
- initialize model runtime.
- feed classifier/separator.
- route processed audio to destination.
- emit sensory events.
- fail open or bypass safely.

### C. Detector

Responsibilities:

- resample/normalize input.
- classify windows.
- confidence smoothing.
- label mapping.
- event state machine.

P0 candidate:
- YAMNet-class-compatible detector or another small AudioSet classifier.

### D. Separator / Attenuator

Responsibilities:

- consume audio block/window + target class condition.
- produce processed audio or source mask.
- protect non-target speech where possible.
- expose runtime latency.

### E. AudioWorklet / DSP Layer

Responsibilities:

- ring buffers.
- smoothing.
- crossfade.
- gain envelopes.
- clip protection.
- avoiding audible discontinuities.

### F. UI

Responsibilities:

- controls.
- status.
- Sensory X-Ray.
- error states.
- privacy state.

### G. Eval Harness

Responsibilities:

- build synthetic mixtures from clean stems.
- run processing.
- compute metrics.
- export JSON + CSV.
- generate no marketing claims automatically.

---

# 11. Audio Data Flow

```text
User clicks Protect
        |
        v
Service Worker
  getMediaStreamId()
        |
        v
Offscreen Document
  getUserMedia(tab stream)
        |
        v
AudioContext
        |
        +-------------------------+
        |                         |
        v                         v
Frame/Ring Buffer            Bypass Path
        |
        v
Detector
        |
        v
Policy Engine
        |
        v
Target Separator
        |
        v
DSP / Crossfade / Limiter
        |
        v
AudioContext.destination

Detector + Policy + Engine events
        |
        v
Sensory Event Bus
        |
        v
Popup / Side Panel / Extension UI
```

---

# 12. Shared TypeScript Contracts

Worker 0 owns these contracts. Other workers consume them.

Suggested modules:

```text
src/shared/audio/types.ts
src/shared/events/types.ts
src/shared/messages/types.ts
src/shared/settings/types.ts
src/shared/errors/types.ts
```

Message envelope:

```ts
type RuntimeMessage =
  | { type: "PROTECTION_START"; tabId: number }
  | { type: "PROTECTION_STOP"; tabId: number }
  | { type: "BYPASS_SET"; enabled: boolean }
  | { type: "TRIGGER_RULES_SET"; rules: TriggerRule[] }
  | { type: "SENSORY_EVENT"; event: SensoryEvent }
  | { type: "ENGINE_STATUS"; status: EngineStatus }
  | { type: "ENGINE_ERROR"; error: AudioShieldError };
```

Engine status:

```ts
type EngineStatus =
  | { state: "idle" }
  | { state: "loading-models" }
  | { state: "capturing"; tabId: number }
  | { state: "protecting"; tabId: number; engine: "separator" | "duck" }
  | { state: "bypassed"; tabId: number }
  | { state: "error"; code: string };
```

---

# 13. Model Strategy

## 13.1 Detector

P0 requirements:

- broad enough to support initial trigger set.
- small enough for on-device browser inference.
- predictable preprocessing.
- open license compatible with public project distribution.

Candidate baseline:

- YAMNet-style classifier: 521 AudioSet classes and known classes including siren-like events.

Do not optimize model novelty. The detector is plumbing.

## 13.2 Separator

This is the core technical risk.

### Winner Requirement

Given a mixture:

`M = Speech + Trigger`

and a selected target `Trigger`:

AudioShield should produce an output where the trigger is attenuated substantially more than speech.

### Preferred Research Candidate

The open-source Semantic Hearing project provides:

- target sound extraction code,
- a downloadable checkpoint,
- MIT-licensed repository,
- a real-time model reported in its paper.

Worker 3 must determine whether that implementation can be adapted to browser tab audio and exported to ONNX without destroying performance.

### Kill Gate

Within the first **4 build hours**, Worker 3 must return one of:

**GREEN**
- model runs on a representative laptop/browser path,
- output separates at least one target class on an overlapping mixture,
- median processing is plausibly real-time or near-real-time,
- export/runtime path is repeatable.

**YELLOW**
- separation works offline but browser performance/export is blocked,
- one specific fix path exists with <=3 additional hours.

**RED**
- cannot run/export,
- unsupported operator chain,
- latency clearly unusable,
- target classes do not fit demo,
- output quality fails the overlap fixture.

If RED:
- do not spend the hackathon polishing a false claim.
- orchestrator must either:
  1. switch to another compact pretrained separator immediately, or
  2. narrow the product claim and re-grade the project before continuing.

---

# 14. Performance Budgets

These are internal targets, not public claims until measured.

## 14.1 Capture / Playback

- No-ML bypass path added latency: target <=60 ms.
- No double audio.
- No sustained clipping.

## 14.2 Detection

- Event UI update cadence: <=500 ms.
- Detection p50 inference: target <=80 ms/window on demo machine.
- Macro F1 on P0 fixture set: target >=0.80.

## 14.3 Selective Attenuation

On synthetic overlap fixtures:

- median selected-trigger attenuation: target >=8 dB.
- minimum acceptable median: 6 dB.
- speech preservation should beat naive full-window ducking by a visible metric.
- target result must hold for at least 10 overlap mixtures, not one cherry-picked clip.

## 14.4 End-to-End

- p50 added protection latency: target <=250 ms.
- p95: target <=450 ms.
- if model design necessarily uses larger windows, document the measured value rather than hiding it.

## 14.5 Reliability

Over 20 repeated start/stop runs:

- capture start success >=95%.
- no duplicate output streams.
- no persistent offscreen zombie processing after stop.
- no crash requiring browser restart.

---

# 15. Evaluation Plan

## 15.1 Fixture Set

Create clean stems:

- speech samples,
- applause,
- dishes/cutlery,
- siren/alarm.

Generate mixtures at multiple ratios:

- trigger louder than speech,
- equal level,
- speech louder than trigger.

Minimum P0 fixture matrix:

- 3 trigger classes.
- 3 level ratios.
- 2 speech clips.
- >=18 overlap mixtures.

Add non-overlap controls to reach 30–50 total fixtures.

## 15.2 Metrics

### Detection
- precision.
- recall.
- F1.
- false positive rate.

### Latency
- p50.
- p95.
- max.

### Audio
Use metrics appropriate to available stems:

- attenuation in dB.
- speech energy preservation.
- SI-SDR or another reproducible separation metric if implementation supports it.
- optional ASR WER delta for speech intelligibility.

### Reliability
- successful start/stop cycles.
- model initialization failures.
- processing underruns.

## 15.3 Naive Baseline

Implement one baseline:

> whole-window ducking by the same requested dB whenever target class is detected.

Winner evidence compares the real separator against this baseline.

Why:

If AudioShield cannot beat naive ducking on speech preservation, the “selective” claim is weak.

## 15.4 Benchmark Output

`bench/results/latest.json`

Example:

```json
{
  "fixtureCount": 36,
  "detection": {
    "macroF1": 0.0
  },
  "latencyMs": {
    "p50": 0,
    "p95": 0
  },
  "audio": {
    "medianTargetAttenuationDb": 0,
    "speechPreservationMetric": 0,
    "baselineSpeechPreservationMetric": 0
  },
  "reliability": {
    "runs": 20,
    "successfulRuns": 0
  }
}
```

Never prefill fake passing values.

---

# 16. UX Specification

## 16.1 Primary Popup

Target width:
- compact Chrome extension scale.
- no horizontal scroll.

Hierarchy:

```text
AudioShield                ● On-device

[ Protected ] / [ Off ]

Protect me from
[✓] Alarms        -18 dB
[✓] Dishes        -14 dB
[ ] Applause      -12 dB

Protection strength
Gentle ----●----- Strong

Speech
✓ Preserve speech

[ Open Sensory X-Ray ]

[ Bypass ]
```

## 16.2 Status Language

Good:

- Protected.
- Bypassed.
- No media detected.
- AudioShield lost access to this tab. Restart protection.
- This device cannot run the selected protection engine in real time.

Bad:

- Inference graph exception.
- WASM EP failed.
- Neural separation unavailable.
- “You are unsafe.”

## 16.3 Sensory X-Ray

Core visual:

```text
-20s                -10s                 now
Speech ━━━━━━━━━━━━━━━━
Dishes       █████ -14 dB
Alarm                    ███ -18 dB
Speech                         ━━━━━━━━━━━
```

Interactions:

- hover/focus event → details.
- keyboard arrow traversal.
- filter by class.
- pause timeline visualization without stopping audio.
- clear history.

Details panel:

- label.
- confidence.
- requested attenuation.
- engine.
- timestamp.

## 16.4 Visual Direction

- dark-first but light mode must remain legible if time allows.
- calm, restrained.
- no medical red unless actual error.
- avoid “cyberpunk AI dashboard.”
- no giant gradients.
- no default-template feel.
- animation only when it explains active protection.
- respect `prefers-reduced-motion`.

---

# 17. Accessibility Requirements

P0:

- all controls keyboard reachable.
- visible focus state.
- labels associated with sliders/toggles.
- minimum target sizes.
- contrast appropriate for text/control states.
- no meaning conveyed by color alone.
- status changes available to assistive technology with polite live regions where appropriate.
- timeline has a non-visual list representation.
- bypass reachable with one keyboard action after popup opens.
- no auto-playing tutorial audio.

---

# 18. Privacy and Security

## 18.1 Principles

- Least privilege.
- No raw audio exfiltration.
- No hidden analytics.
- No account.
- No all-sites content script if not required.
- No remote code execution.
- No secret API keys.
- No health record storage.

## 18.2 Expected Extension Permissions

Minimum likely set:

```json
[
  "tabCapture",
  "offscreen",
  "storage"
]
```

Add other permissions only with a concrete feature justification.

If `sidePanel` is used, add it intentionally.

Avoid broad host permissions unless required.

## 18.3 Data Storage

Allowed:

- trigger preferences.
- per-site settings.
- user UI preferences.
- local benchmark output for development.

Not persisted in production:

- raw tab audio.
- full browsing history.
- audio transcripts.
- inferred medical state.

## 18.4 Network Behavior

P0 target:

- model/runtime assets bundled or fetched only as static application assets.
- no raw audio POST/WebSocket.
- no audio analytics.

A network inspection test must prove this.

---

# 19. Failure States

Every one must have a product response.

| Failure | Product behavior |
|---|---|
| No audible media | Show “No media detected” |
| User stops capture | Return to Off state |
| Tab closes | Stop engine + cleanup |
| Tab reloads | Detect ended stream; offer restart |
| Model load fails | Error state, bypass safely |
| WebGPU missing | Try supported fallback |
| Fallback too slow | State unsupported; do not fake |
| AudioContext suspended | Resume after user gesture when possible |
| Processor underrun | Log metric, soften transition, avoid explosion |
| Extension UI closes | Processing continues |
| Service worker sleeps | Offscreen runtime remains authoritative for active audio |
| Unknown sound | Do nothing |
| Confidence near threshold | Hysteresis prevents rapid toggling |
| User hits bypass | Original path restored immediately |

---

# 20. Repository Structure

```text
audioshield/
├─ extension/
│  ├─ manifest.json
│  ├─ src/
│  │  ├─ background/
│  │  │  └─ service-worker.ts
│  │  ├─ offscreen/
│  │  │  ├─ offscreen.html
│  │  │  ├─ offscreen.ts
│  │  │  └─ audio-runtime.ts
│  │  ├─ audio/
│  │  │  ├─ graph/
│  │  │  ├─ worklets/
│  │  │  ├─ dsp/
│  │  │  └─ buffers/
│  │  ├─ ml/
│  │  │  ├─ detector/
│  │  │  ├─ separator/
│  │  │  ├─ runtime/
│  │  │  └─ models/
│  │  ├─ policy/
│  │  ├─ shared/
│  │  ├─ storage/
│  │  ├─ ui/
│  │  │  ├─ popup/
│  │  │  └─ xray/
│  │  └─ test/
│  └─ public/
│
├─ bench/
│  ├─ fixtures/
│  ├─ scripts/
│  ├─ results/
│  └─ README-NOTES.txt
│
├─ model-tools/
│  ├─ export/
│  ├─ validate/
│  └─ requirements.txt
│
├─ tests/
│  ├─ integration/
│  ├─ e2e/
│  └─ security/
│
├─ evidence/
│  ├─ ai-usage-log.jsonl
│  ├─ metrics.json
│  ├─ test-results/
│  └─ manual-checks.md
│
└─ package.json
```

**Hackathon rule:** The team must write the final README and project description themselves. Agents may generate factual test outputs and machine-readable evidence, not final submission prose.

---

# 21. Testing Strategy

## 21.1 Unit

Required:

- trigger policy.
- confidence hysteresis.
- gain conversion.
- settings schema.
- event ring buffer.
- message validation.
- error mapping.
- state transitions.
- cleanup/idempotency.

## 21.2 Integration

Required:

- service worker → offscreen message.
- offscreen → audio runtime.
- detector → policy.
- policy → engine.
- engine → sensory event.
- UI → settings.
- bypass.
- capture stop cleanup.

## 21.3 Browser Manual/E2E

At minimum:

- YouTube or a controlled HTML5 media fixture.
- extension action.
- start/stop.
- close/reopen popup.
- playback continues.
- timeline updates.
- change trigger rule live.
- bypass.
- reload tab.
- close tab.

## 21.4 Audio Bench

No worker may mark audio “done” based on subjective listening only.

Run fixture benchmark and produce metrics.

---

# 22. Definition of P0 Done

P0 is green only if every item below passes:

- [ ] Extension installs cleanly.
- [ ] User can protect current media tab.
- [ ] Captured audio is heard through extension output.
- [ ] At least 3 trigger categories are available.
- [ ] Detector works on fixture set.
- [ ] Final release engine is not naive whole-window ducking.
- [ ] Overlapping speech + trigger demo works.
- [ ] Trigger attenuation is measured.
- [ ] Speech preservation is measured.
- [ ] Real separator beats naive duck baseline on the chosen preservation metric.
- [ ] Bypass works.
- [ ] No raw audio leaves device in network inspection.
- [ ] Sensory X-Ray shows live events.
- [ ] Popup is keyboard usable.
- [ ] Error/empty states exist.
- [ ] p50/p95 latency recorded.
- [ ] 20 start/stop reliability runs recorded.
- [ ] Tests pass.
- [ ] Release build has no DEV_DUCK_ENGINE enabled.
- [ ] Demo can be executed from a fresh extension state.
- [ ] No unsupported health claims appear in product UI.

---

# 23. Demo Proof Plan

Do not lead with architecture.

## 0:00–0:15 — Problem

Play 2–3 seconds of a mixture.

Say the problem in one line:

> Browser volume is all-or-nothing. If one sound bothers you, you usually have to lower everything, including the speech you wanted.

## 0:15–0:35 — Configure

Open AudioShield.

Select:

- Dishes.
- Alarm.

Show:

- On-device.
- Speech preserved.

Click Protect.

## 0:35–1:15 — Oh-Damn Moment

Play the overlap fixture:

`speech + dishes + alarm`

Show:

- speech remains.
- dishes soften.
- alarm softens.

Sensory X-Ray visibly lights up.

## 1:15–1:40 — Change Rule Live

Disable dishes.

Replay or continue.

Dishes return while alarm remains softened.

This proves semantic control, not a canned noise filter.

## 1:40–2:10 — Evidence

Show benchmark panel or static generated metrics:

- N fixtures.
- detector F1.
- target attenuation dB.
- speech preservation.
- p50/p95 latency.

Only measured values.

## 2:10–2:35 — Privacy

Show:

- no account.
- local processing.
- network panel / architecture evidence that raw audio is not sent out.

## 2:35–2:55 — Failure / Bypass

Hit bypass.

Original audio immediately returns.

Optional:
- simulate model error and show fail-safe state.

## 2:55–3:20 — Architecture

Now show:

`tabCapture → offscreen → detector → separator → Web Audio → X-Ray`

## 3:20–3:35 — Close

> Every website decides what audio gets mixed together. AudioShield gives the listener control back.

Keep entire demo under the hackathon video limit.

---

# 24. Cut Rules

Cut a feature immediately if:

- it does not improve an official rubric axis,
- it does not strengthen the demo,
- it adds model/runtime instability,
- it requires cloud audio upload,
- it cannot be tested,
- it duplicates an existing control,
- it consumes >2 hours without unblocking P0,
- it exists because “AI” sounds impressive.

Priority:

1. true overlapping attenuation.
2. capture reliability.
3. evidence.
4. user flow.
5. Sensory X-Ray.
6. visual polish.
7. everything else.

---

# 25. Agent Orchestrator Strategy

AO should not run ten agents that all edit the same files.

The build uses:

- one contract/scaffold worker first,
- parallel specialist workers with disjoint ownership,
- one integration worker,
- one adversarial verification worker,
- orchestrator as merge gate and final decision-maker.

## 25.1 Orchestrator Responsibilities

The orchestrator should do only:

1. Verify Worker 0 contracts/scaffold.
2. Launch workers with explicit file ownership.
3. Reject workers that modify forbidden files.
4. Review worker evidence.
5. Merge only green commits.
6. Re-run global test suite after each merge wave.
7. Enforce the separator kill gate.
8. Resolve only true cross-worker contract conflicts.
9. Launch integration worker.
10. Launch red-team worker.
11. Approve release only when P0 Definition of Done passes.

The orchestrator should **not**:

- casually rewrite worker code,
- add features during integration,
- accept “works on my branch” without tests,
- let a worker silently change shared interfaces,
- let UI polish hide a red audio engine.

---

# 26. AO Wave Plan

## Wave 0 — Contracts and Scaffold

**Worker 0 only.**

Time budget: 45–75 min.

Output:

- extension scaffold.
- type contracts.
- baseline scripts.
- test setup.
- empty implementations behind interfaces.

Orchestrator gate:
- build passes.
- tests run.
- directory ownership stable.

## Wave 1 — Parallel Core Specialists

Launch in parallel after Worker 0 commit.

- Worker 1 — Chrome Capture Runtime.
- Worker 2 — Detector.
- Worker 3 — Separator Feasibility + Implementation.
- Worker 4 — DSP / AudioWorklet.
- Worker 5 — UI + Sensory X-Ray.
- Worker 6 — Settings / Privacy / State.
- Worker 7 — Bench / Fixture Harness.

The highest-priority result is Worker 3.

If Worker 3 returns RED, stop feature expansion and pivot the audio architecture.

## Wave 2 — Integration

Launch after Workers 1–7 are green enough.

- Worker 8 — Integration + extension runtime wiring.

No new product features.

## Wave 3 — Adversarial Verification

- Worker 9 — E2E / reliability / security / performance red-team.

Worker 9 does not fix everything silently.

It returns:

- MUST FIX.
- SHOULD FIX.
- CUT.

## Wave 4 — Evidence Freeze

- Worker 10 — Evidence collector + release audit.

Produces machine-readable facts only.

User/team writes final README/Devpost copy manually.

---

# 27. Worker Ownership Matrix

| Worker | Owns | Must not edit |
|---|---|---|
| 0 Contracts | scaffold, shared contracts, configs | feature implementation |
| 1 Capture | `background/`, offscreen capture lifecycle | ML, UI |
| 2 Detector | `ml/detector/`, detector tests | separator, UI |
| 3 Separator | `ml/separator/`, model export tools | detector, UI |
| 4 DSP | `audio/`, worklets | ML model logic, UI |
| 5 UI | `ui/` | runtime/ML internals |
| 6 State | `storage/`, settings/privacy state | capture/ML |
| 7 Bench | `bench/`, benchmark scripts | extension runtime |
| 8 Integration | explicit glue files only | model internals unless approved |
| 9 Red Team | tests + reports | production source unless assigned fix |
| 10 Evidence | `evidence/` | submission prose |

Shared interfaces are immutable after Worker 0 unless orchestrator approves a change.

---

# 28. Standard Worker Return Contract

Every worker must finish with:

```text
STATUS: GREEN | YELLOW | RED

COMMIT:
<hash or NONE>

FILES CHANGED:
- ...

TESTS RUN:
- command -> PASS/FAIL

ACCEPTANCE:
- [x] ...
- [ ] ...

MEASUREMENTS:
- metric: value

KNOWN RISKS:
- ...

BLOCKERS:
- NONE | ...

ORCHESTRATOR ACTION:
- MERGE
- REVIEW <specific item>
- DO NOT MERGE
```

No essays.

---

# 29. Worker 0 Prompt — Scaffold + Contracts

## Goal

Create the AudioShield extension scaffold and shared contracts so every other worker can build independently.

## Inputs

- This PRD.
- Chrome Manifest V3.
- TypeScript + React.
- Repository root.

## Ownership

You may edit:

- `extension/manifest.json`
- `extension/src/shared/**`
- baseline empty files/directories
- root package/config files
- Vitest config
- TypeScript config

Do not implement capture, ML, DSP, UI features, or benchmarks.

## Tasks

1. Create the repo structure from the PRD.
2. Create shared types:
   - TriggerRule
   - SoundDetection
   - AttenuationDecision
   - SensoryEvent
   - EngineStatus
   - RuntimeMessage
   - AudioShieldError
3. Add runtime message validation.
4. Add default P0 trigger IDs.
5. Add scripts:
   - `npm run build`
   - `npm run test`
   - `npm run typecheck`
6. Add minimal smoke tests for shared contracts.
7. Ensure empty feature modules compile.
8. Do not add broad Chrome host permissions.

## Success

- build passes.
- tests pass.
- typecheck passes.
- no feature logic added.
- interfaces match PRD.

## Return

Use the Standard Worker Return Contract only.

---

# 30. Worker 1 Prompt — Chrome Capture Runtime

## Goal

Implement reliable current-tab audio capture and offscreen playback without ML.

## Inputs

- Worker 0 contracts.
- Chrome `tabCapture`.
- Chrome `offscreen`.
- PRD FR-001/002.

## Ownership

Edit only:

- `extension/src/background/**`
- `extension/src/offscreen/**`
- capture-specific tests

Do not edit:

- `shared/**`
- `ml/**`
- `audio/**`
- `ui/**`

## Tasks

1. Start capture only from an extension user gesture.
2. Obtain a tab media stream ID.
3. Create/reuse one offscreen document.
4. Convert stream ID to tab audio MediaStream.
5. Create AudioContext.
6. Route captured stream back to output.
7. Implement:
   - start.
   - stop.
   - tab closed.
   - stream ended.
   - repeated start idempotency.
8. Emit EngineStatus messages.
9. Add cleanup.
10. Add unit/integration tests where Chrome APIs can be mocked.
11. Add a manual test script/instructions in test comments, not README prose.

## Hard Rules

- No ML.
- No full-page content script.
- No duplicate playback.
- No infinite retries.
- Offscreen close must not leave audio processing alive.

## Acceptance

- Bypass-only capture path works on a real HTML5/YouTube tab.
- popup may close without stopping processing.
- 10 start/stop cycles do not create duplicate streams.

## Return

Use the Standard Worker Return Contract only.

---

# 31. Worker 2 Prompt — Sound Detector

## Goal

Implement local semantic sound event detection for the P0 trigger classes.

## Inputs

- Shared contracts.
- P0 target classes:
  - alarm/siren.
  - dishes/cutlery/clatter.
  - applause.
  - speech as protected signal.
- ONNX Runtime Web or another browser-local runtime.

## Ownership

Edit only:

- `extension/src/ml/detector/**`
- detector model adapter files
- detector tests
- detector-specific static model assets if small enough

Do not edit:

- separator.
- audio graph.
- UI.
- shared contracts.

## Tasks

1. Implement a detector interface:
   - initialize.
   - process audio window.
   - dispose.
2. Normalize model labels into P0 IDs.
3. Add confidence smoothing/hysteresis.
4. Prevent rapid event flicker.
5. Support mocked inference for tests.
6. Run a fixture sanity test.
7. Record model load time and inference latency.
8. Document attribution/license facts in a machine-readable file, not marketing prose.

## Hard Rules

- Inference must be local.
- Never invent model confidence.
- Do not use an LLM for classification.
- Do not block the audio thread with UI work.

## Acceptance

- at least 3 trigger classes map correctly.
- speech can be recognized/protected if available.
- detector returns timestamped SoundDetection objects.
- latency measurements are real.

## Return

Use the Standard Worker Return Contract only.

---

# 32. Worker 3 Prompt — Target Separator / Technical Kill Gate

## Goal

Prove and implement the hard part: attenuate a selected trigger in an overlapping mixture while preserving speech better than naive whole-window ducking.

## Inputs

- Shared contracts.
- Open-source Semantic Hearing implementation/checkpoint as first candidate.
- ONNX Runtime Web.
- WebGPU.
- Synthetic fixture:
  - clean speech stem.
  - clean dishes or alarm stem.
  - mixed together.

## Ownership

Edit only:

- `extension/src/ml/separator/**`
- `model-tools/export/**`
- `model-tools/validate/**`
- separator tests
- separator model assets/config

Do not edit:

- UI.
- detector.
- capture runtime.
- shared contracts.

## Time Gate

Return first feasibility result within 4 build hours.

## Tasks

1. Inspect candidate model license and runtime.
2. Attempt repeatable inference on the overlap fixture.
3. Attempt ONNX export.
4. Test ONNX Runtime Web compatibility.
5. Test WebGPU.
6. Measure:
   - model size.
   - init time.
   - inference time.
   - target attenuation.
   - speech preservation metric.
7. Compare against naive whole-window ducking.
8. If candidate fails, test one smaller alternative.
9. Implement a `SeparatorEngine` interface only after feasibility is proven.
10. Never hide unsupported operators or bad latency.

## GREEN Gate

Return GREEN only if:

- overlapping source attenuation is audible and measurable.
- speech preservation beats naive ducking.
- browser/runtime path is repeatable.
- latency is plausibly usable for the demo.

## RED Gate

Return RED if:

- model cannot export/run.
- latency is clearly unusable.
- target classes mismatch.
- quality fails.
- browser requires a local server/end-user terminal.

## Hard Rules

- No fake preprocessed output in final path.
- No whole-window ducking labeled as separation.
- No cloud audio upload.
- No training from scratch.

## Return

Use the Standard Worker Return Contract only.

---

# 33. Worker 4 Prompt — DSP + AudioWorklet

## Goal

Create a stable low-latency audio processing layer around detector/separator outputs.

## Inputs

- Shared contracts.
- Web Audio API.
- AudioWorklet.

## Ownership

Edit only:

- `extension/src/audio/**`
- DSP tests

Do not edit:

- ML model implementations.
- UI.
- shared contracts.

## Tasks

1. Implement ring buffer utilities.
2. Implement safe gain conversion.
3. Implement smooth attack/release envelopes.
4. Implement crossfade between bypass/protected paths.
5. Add clip prevention/limiter if needed.
6. Expose timing/underrun metrics.
7. Ensure processor never emits NaN/Infinity.
8. Add deterministic unit tests.
9. Add a baseline naive duck engine under `DEV_DUCK_ENGINE`.
10. Make dev engine impossible to enable accidentally in release build.

## Acceptance

- no clicks/pops on category changes in fixture test.
- bypass transition is stable.
- no clipping in generated stress fixture.
- dev duck baseline is available for benchmark comparison only.

## Return

Use the Standard Worker Return Contract only.

---

# 34. Worker 5 Prompt — Product UI + Sensory X-Ray

## Goal

Build the complete P0 user experience without touching audio internals.

## Inputs

- Shared contracts.
- PRD UX specification.

## Ownership

Edit only:

- `extension/src/ui/**`
- UI assets
- UI tests

Do not edit:

- background.
- offscreen.
- ML.
- DSP.
- shared contracts.

## Tasks

1. Build popup:
   - status.
   - Protect this tab.
   - trigger toggles.
   - attenuation controls.
   - global strength.
   - speech-preserve status.
   - bypass.
   - privacy status.
2. Build Sensory X-Ray:
   - rolling timeline.
   - labels.
   - confidence.
   - attenuation.
   - protected/softened states.
3. Add non-visual event list.
4. Add empty/error/loading states.
5. Keyboard-test all controls.
6. Respect reduced motion.
7. Avoid template/default appearance.
8. Add component tests with mocked RuntimeMessages.

## Hard Rules

- No fake live data in production.
- No “AI-powered” marketing copy in interface.
- No medical claims.
- Technical settings stay secondary.

## Acceptance

- new user understands core action without instructions.
- full popup is keyboard usable.
- X-Ray renders real event messages.
- error states are visible and readable.

## Return

Use the Standard Worker Return Contract only.

---

# 35. Worker 6 Prompt — Settings, Privacy, State

## Goal

Implement durable local preferences and privacy-safe runtime state.

## Inputs

- Shared contracts.
- Chrome storage.
- PRD privacy requirements.

## Ownership

Edit only:

- `extension/src/storage/**`
- `extension/src/policy/**` if policy is assigned here
- state/settings tests

Do not edit:

- capture.
- ML.
- audio.
- UI rendering.

## Tasks

1. Implement settings schema + defaults.
2. Store:
   - trigger rules.
   - global strength.
   - optional site preferences.
3. Add schema migration version.
4. Never store raw audio.
5. Implement trigger policy decisions.
6. Add confidence thresholds.
7. Add hysteresis configuration.
8. Add site-key normalization if P1 site profiles land.
9. Add tests for corrupt storage and migrations.
10. Add a privacy assertion test that rejects raw audio-shaped payloads from persistence APIs where practical.

## Acceptance

- restart extension → settings persist.
- raw audio not persisted.
- corrupt settings recover safely.
- policy output is deterministic.

## Return

Use the Standard Worker Return Contract only.

---

# 36. Worker 7 Prompt — Fixtures + Benchmark Harness

## Goal

Create reproducible evidence for detection, attenuation, speech preservation, latency, and reliability.

## Inputs

- Clean audio fixture stems.
- Shared contracts.
- Engine adapters.

## Ownership

Edit only:

- `bench/**`
- benchmark-only scripts
- benchmark tests

Do not edit production extension source.

## Tasks

1. Create fixture manifest.
2. Build synthetic overlap mixtures.
3. Cover:
   - 3 trigger classes.
   - multiple level ratios.
   - multiple speech clips.
4. Implement naive duck baseline comparison.
5. Compute:
   - detector precision/recall/F1.
   - p50/p95 latency.
   - target attenuation dB.
   - speech preservation metric.
6. Export:
   - JSON.
   - CSV.
7. Never round a failing number into a pass.
8. Add deterministic seeds for generated mixes.
9. Make benchmark runnable with one command.
10. Store actual results under `bench/results/`.

## Hard Rules

- No fake values.
- No cherry-picked single clip as overall metric.
- Distinguish measured results from targets.

## Acceptance

- one command generates the benchmark result.
- fixture count >=30 by final build.
- overlap subset >=10.
- baseline comparison included.

## Return

Use the Standard Worker Return Contract only.

---

# 37. Worker 8 Prompt — Integration Owner

## Goal

Wire the green specialist modules into one working AudioShield P0 extension.

## Inputs

- Worker 1–7 commits.
- Shared contracts.
- P0 Definition of Done.

## Ownership

Edit only integration/glue files approved by orchestrator:

- `extension/src/offscreen/audio-runtime.ts`
- composition/root files.
- message wiring.
- integration tests.

Do not rewrite specialist internals unless orchestrator explicitly approves.

## Tasks

1. Wire:
   - capture stream.
   - audio frame pipeline.
   - detector.
   - policy.
   - separator.
   - DSP.
   - output.
   - Sensory X-Ray events.
2. Wire settings to runtime.
3. Wire bypass.
4. Wire cleanup.
5. Wire error states.
6. Run build/typecheck/tests.
7. Run real browser smoke test.
8. Confirm release path does not use DEV_DUCK_ENGINE.
9. Record integration latency.
10. Do not add features.

## Acceptance

- clean install.
- protect real tab.
- overlap fixture works.
- UI shows real events.
- bypass works.
- no duplicate playback.
- tests pass.

## Return

Use the Standard Worker Return Contract only.

---

# 38. Worker 9 Prompt — Adversarial Red Team

## Goal

Try to break the complete extension like a skeptical hackathon judge.

## Inputs

- integrated P0 build.
- Definition of Done.
- rubric.

## Ownership

Edit only:

- `tests/e2e/**`
- `tests/security/**`
- `evidence/test-results/**`
- red-team report

Do not modify production source in this pass.

## Attack Cases

1. Start protection twice.
2. Stop/start rapidly.
3. Close popup.
4. Reload media tab.
5. Navigate tab.
6. Close tab.
7. Pause/resume video.
8. Mute/unmute.
9. Trigger overlapping speech + sound.
10. Trigger unknown sound.
11. WebGPU unavailable.
12. model load failure.
13. bad settings.
14. bypass during active attenuation.
15. inspect network for audio egress.
16. inspect extension permissions.
17. keyboard-only UI.
18. reduced-motion mode.
19. 20 repeat start/stop cycles.
20. sustained playback for >=10 minutes if time permits.

## Output

Classify every finding:

- MUST FIX — demo/rubric/reliability failure.
- SHOULD FIX — visible quality issue.
- CUT — feature should be removed instead of fixed.

## Hard Rules

- Do not praise.
- Do not fix production code silently.
- Include reproduction steps.
- Include evidence.

## Return

Use the Standard Worker Return Contract plus a finding table.

---

# 39. Worker 10 Prompt — Evidence + Release Audit

## Goal

Collect final factual evidence without writing submission prose.

## Inputs

- release candidate.
- benchmark results.
- test results.
- git history.
- AO usage.

## Ownership

Edit only:

- `evidence/**`

Do not edit:

- production code.
- README.
- Devpost description.
- marketing copy.

## Tasks

1. Write `evidence/metrics.json` with measured values.
2. Write `evidence/release-check.json`.
3. Record:
   - build command.
   - test command.
   - passing test count.
   - benchmark fixture count.
   - p50/p95 latency.
   - attenuation metric.
   - speech preservation metric.
   - reliability run result.
4. Record extension permissions.
5. Record model names/licenses/attributions.
6. Record AI/AO usage in `ai-usage-log.jsonl`:
   - model/tool.
   - task.
   - representative prompt or prompt hash/location.
   - whether paid/free if known.
7. Verify no DEV_DUCK_ENGINE in release.
8. Verify no raw audio network egress in available test.
9. Do not turn facts into submission paragraphs.

## Acceptance

- every public claim the team may choose to write can be traced to a measurement or artifact.
- no invented metrics.
- no AI-generated submission prose.

## Return

Use the Standard Worker Return Contract only.

---

# 40. Orchestrator Merge Gates

## Gate A — Scaffold

Merge Worker 0 only if:

- build/test/typecheck green.
- shared contracts are sufficient.
- no over-broad manifest permissions.

## Gate B — Audio Feasibility

Before spending major time on polish:

- Worker 1 capture = GREEN.
- Worker 3 separation = GREEN or credible YELLOW with <=3h path.

If Worker 3 RED:
- stop UI expansion.
- decide architecture pivot immediately.

## Gate C — Specialist Merge

For each worker:

- only owned files changed.
- tests included.
- return contract complete.
- no fake data.
- no unapproved shared contract edits.

## Gate D — Integrated P0

Must pass:

- overlap fixture.
- bypass.
- live X-Ray.
- benchmark.
- privacy check.
- release build.

## Gate E — Red Team

No open MUST FIX findings.

If a MUST FIX cannot be solved inside remaining time:
- cut the feature/claim.

---

# 41. AO Conflict Rules

1. Shared contracts change only through orchestrator approval.
2. A worker discovering a missing contract must stop and report the exact needed field/interface.
3. Workers never refactor unrelated modules.
4. Integration worker may adapt glue, not rewrite specialist internals.
5. Red-team worker does not fix production code during audit.
6. Fix tasks after red-team get new narrow workers with explicit file ownership.
7. Never allow two agents to “clean up” the same directory concurrently.

---

# 42. Suggested Hour Budget

Assume 48-hour hackathon, but protect sleep and submission time.

## Hour 0–1
- Worker 0 scaffold.
- Orchestrator checks.

## Hour 1–5
Parallel:
- Worker 1 capture.
- Worker 2 detector.
- Worker 3 separator kill gate.
- Worker 4 DSP.
- Worker 5 UI.
- Worker 6 state.
- Worker 7 bench.

## Hour 5
Decision point:

- Separator GREEN → continue.
- YELLOW → give one focused fix worker.
- RED → pivot architecture before sunk cost.

## Hour 5–10
- finish core workers.
- first specialist merges.

## Hour 10–14
- Worker 8 integration.
- overlap demo working.

## Hour 14–18
- benchmarks.
- reliability.
- X-Ray polish.
- real user feedback if possible.

## Hour 18–24
- red team.
- MUST FIX repairs.

## Hour 24–32
- stronger UI.
- more fixtures.
- site profile P1 only if P0 is green.
- accessibility pass.

## Hour 32–38
- final benchmark.
- demo rehearsal.
- failure case rehearsal.
- release build.

## Hour 38–42
- evidence freeze.
- fresh install test.
- video recording.

## Hour 42–48
Reserve.

Use for:
- video retake.
- public repo cleanup.
- manually written README/Devpost.
- upload problems.
- submission verification.

Do not code a new feature in the last 4 hours unless it fixes a disqualifying issue.

---

# 43. Risk Register

## R1 — Browser Separation Too Slow

**Probability:** high  
**Impact:** critical

Mitigation:
- Worker 3 kill gate in first 4 hours.
- WebGPU.
- smaller model.
- narrow trigger set.
- optimize window size.
- cut claim rather than fake.

## R2 — Research Model Assumes Binaural Environmental Audio

**Probability:** medium-high  
**Impact:** high

Mitigation:
- test real browser stereo immediately.
- do not assume paper benchmark transfers.
- use candidate only if fixture evidence passes.

## R3 — Extension Capture Lifecycle Bugs

**Probability:** medium  
**Impact:** high

Mitigation:
- isolated Worker 1.
- idempotent session state.
- repeat start/stop test.

## R4 — Audio Artifacts

**Probability:** medium  
**Impact:** high

Mitigation:
- Worker 4 smoothing/crossfade.
- stress fixtures.
- clip detection.

## R5 — Detector False Positives

**Probability:** medium  
**Impact:** medium

Mitigation:
- threshold controls.
- hysteresis.
- narrow classes.
- benchmark.

## R6 — Privacy Claim Is False Because of Model Fetch/Telemetry

**Probability:** low-medium  
**Impact:** critical

Mitigation:
- static assets.
- network inspection.
- no raw audio requests.
- precise wording: local audio processing, not “fully offline” unless proven.

## R7 — Novelty Challenge

**Probability:** high  
**Impact:** high

Mitigation:
- never claim invention of semantic attenuation.
- foreground browser-native workflow + X-Ray + site rules.
- show product delta in demo.

## R8 — No Real User Evidence

**Probability:** medium  
**Impact:** medium

Mitigation:
- obtain one legitimate observation/quote.
- do not fabricate.
- technical evidence remains primary.

## R9 — AI Documentation Rule

**Probability:** medium  
**Impact:** disqualification/points risk

Mitigation:
- this PRD stays internal.
- agents produce facts, not final submission prose.
- team writes final README/Devpost from scratch.
- maintain transparent AI usage log.

---

# 44. Judge Q&A Readiness

The build must have concrete answers to:

## “Sona already does this. What is new?”

Answer with browser-native product delta.

## “Why is this not Krisp?”

Answer:

- user-selected semantic trigger categories,
- browser media consumption,
- not general background-noise removal for calls.

## “How do you remove dishes if speech overlaps them?”

Show overlap fixture and measurement.

## “How do you know speech remains?”

Show metric and A/B.

## “Does audio leave the machine?”

Show architecture + network evidence.

## “What happens if the model fails?”

Show bypass/fail-safe.

## “Did a sound-sensitive user try this?”

Use only real evidence.

---

# 45. Winning Edge

The strongest differentiator is **Sensory X-Ray + persistent semantic rules**.

The long-term product metaphor:

> an ad blocker for unwanted sound categories.

But the hackathon P0 should prove this concretely:

1. Select trigger.
2. Hear live difference.
3. See exact event.
4. Change rule.
5. Hear behavior change.
6. Verify measured result.

That is far stronger than a dashboard full of wellness metrics.

---

# 46. Final Release Checklist

## Product
- [ ] Protect current tab.
- [ ] At least 3 real trigger categories.
- [ ] Speech protection.
- [ ] Real selective separator.
- [ ] Overlap fixture.
- [ ] Bypass.
- [ ] X-Ray.
- [ ] Error states.

## Technical
- [ ] Manifest V3.
- [ ] Offscreen lifecycle.
- [ ] No double playback.
- [ ] WebGPU path.
- [ ] supported fallback behavior.
- [ ] no dev duck engine in release.
- [ ] all tests green.

## Evidence
- [ ] fixture count recorded.
- [ ] detection F1.
- [ ] attenuation dB.
- [ ] speech preservation.
- [ ] baseline comparison.
- [ ] p50/p95 latency.
- [ ] reliability cycles.
- [ ] privacy/network check.

## UX
- [ ] keyboard.
- [ ] focus.
- [ ] contrast.
- [ ] reduced motion.
- [ ] no AI dashboard boilerplate.
- [ ] fresh-user flow <=60 sec.

## Compliance
- [ ] all work built inside allowed hackathon window.
- [ ] open-source code/models credited.
- [ ] AI usage recorded.
- [ ] team writes final Devpost documentation itself.
- [ ] public repo.
- [ ] demo video within required length.
- [ ] team/contribution info complete.
- [ ] bonus-track details complete if entered.

---

# 47. Evidence Basis Used for This PRD

This internal plan is grounded in:

1. **CS Girlies Technology for Wellness official Devpost materials**
   - Health track rewards advanced technical work involving real health-related use cases.
   - judging criteria: Wellness Impact, Creativity & Innovation, Technical Craft & Execution, Design & UX, Community & Accessibility.
   - AI build tools are allowed with transparency.
   - final project description/documentation must be team-written.

2. **Chrome tabCapture official documentation**
   - current tab audio/video can be captured after explicit extension invocation.
   - once captured, tab audio must be re-routed to an AudioContext destination for the user to keep hearing it.

3. **Chrome Offscreen API official documentation**
   - an offscreen document provides DOM/web APIs unavailable to Manifest V3 service workers and is appropriate for hidden audio-related processing.

4. **ONNX Runtime Web official documentation**
   - browser-local model inference is supported.
   - WebGPU and WASM execution paths are available depending on runtime/browser support.

5. **TensorFlow YAMNet official material**
   - YAMNet predicts 521 AudioSet sound-event classes and is a reasonable detector baseline.

6. **Sona: Real-Time Multi-Target Sound Attenuation for Noise Sensitivity (2026)**
   - establishes that selective multi-target attenuation for noise-sensitive users is real prior art.
   - therefore AudioShield must not claim the underlying concept as novel.

7. **Semantic Hearing open-source repository / UIST 2023 work**
   - provides an MIT-licensed real-time target sound extraction implementation/checkpoint.
   - this is a feasibility candidate, not a guaranteed browser solution.

---

# 48. Single Highest-Leverage Build Action

**Do not start with UI.**

Launch Worker 0 immediately, then launch Workers 1 and 3 as soon as contracts exist.

The project lives or dies on two proofs:

1. Chrome tab audio can be captured and re-routed cleanly.
2. A selected overlapping trigger can be attenuated while speech is preserved better than naive full-window ducking.

Everything else is secondary until those are green.
