# AudioShield

AudioShield is a local Chrome extension for people who find certain browser sounds distracting, harsh, or overwhelming. Instead of muting an entire video just because one sound is unbearable, AudioShield gives you control over the parts that bother you while trying to keep speech and the rest of the content understandable.

## Summary

A lot of browser audio is all or nothing. You either listen to the whole mix, lower the whole tab, or mute it completely. That works until the problem is one specific part of the sound, like an alarm, glass breaking, clatter, sudden loudness, or constant background noise.

AudioShield sits directly in the browser and processes tab audio locally. You choose which sensory profiles should be softened, choose how strong the protection should be, and can see what the engine is reacting to in real time. No account is required, and the audio does not need to leave the extension.

## What You Can Do With It

- Soften alarms, sirens, and piercing tones
- Reduce steady background noise with local neural suppression
- Damp glass, brittle crashes, clatter, applause, and sharp impacts
- Reduce harsh highs and sudden loudness
- Adjust each profile from 0% to 100%
- Control a master protection strength live while media is playing
- Bypass protection instantly to compare against the original audio
- Use Sensory X-Ray to see the routing score and processing being applied
- Keep preferences stored locally between sessions

## Install

AudioShield currently runs as an unpacked Chrome extension.

```bash
git clone https://github.com/saiaathish/AudioShield.git
cd AudioShield
npm ci
npm run build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist/` folder.
5. Pin AudioShield to the Chrome toolbar.
6. Open a tab with audio and click the AudioShield icon once.

Chrome 116 or newer is required.

## What It Feels Like To Use

Open a video, click the AudioShield toolbar icon, and the side panel appears. From there you can turn individual sensory profiles on or off, tune each one independently, and move the overall protection strength anywhere from the untouched original at 0% to aggressive suppression at 100%.

The important part is that the controls are live. You can move the slider while the sound is playing and hear the protection change immediately instead of configuring something, refreshing the page, and hoping it worked.

## How It Works

AudioShield captures the current tab with Chrome's `tabCapture` API and routes the stream into a local Web Audio graph inside an offscreen extension document.

The engine combines three ideas:

1. **Local neural suppression** uses GTCRN first and RNNoise as a fallback for steady background noise and foreground recovery.
2. **Adaptive sensory routing** analyzes spectral shape, transients, loudness, and persistent tones to decide which protection path should have the most authority at that moment.
3. **Targeted Web Audio DSP** applies adaptive notches, filtering, dynamics, and stem-style remixing so strong nuisance events can be reduced without simply lowering the entire tab.

Speech is treated as something worth protecting, not just another sound to compress. The processing path keeps a foreground-first mix and uses dedicated voice-preservation logic so aggressive suppression does not have to mean unintelligible dialogue.

## Infrastructure

- TypeScript
- React
- Chrome Extension Manifest V3
- Chrome `tabCapture`, `offscreen`, `sidePanel`, and `storage` APIs
- Web Audio API
- AudioWorklet
- GTCRN and RNNoise through `@sapphi-red/web-noise-suppressor`
- WebAssembly inference running locally
- Adaptive spectral and transient analysis
- esbuild
- GitHub Actions for build, type checking, audit, and extension artifact verification

All runtime model and WASM assets are packaged with the extension. AudioShield does not depend on a remote inference API to process tab audio.

## Project Structure

```text
AudioShield/
├── .github/workflows/    # CI
├── assets/icons/         # AudioShield branding
├── scripts/              # Extension build pipeline
├── src/
│   ├── offscreen/        # Capture and audio engine
│   ├── shared/           # Runtime contracts and settings types
│   ├── storage/          # Local preferences
│   └── ui/               # Side panel interface
├── manifest.json
├── package.json
├── THIRD_PARTY_NOTICES.md
└── README.md
```

## Why This Matters

The browser normally decides what you have to hear. If one part of a video is uncomfortable, the usual answer is to reduce everything, including the voices or information you actually wanted.

AudioShield is built around a different idea: the user should get that decision back. It is especially useful as an accessibility experiment for people with auditory sensitivity, but the same controls can help anyone who wants calmer browser audio without losing the whole mix.

## Limitations

AudioShield is still a prototype, not a medical device. Results depend on the source audio, and some sensory profiles are adaptive signal-routing systems rather than perfect semantic classifiers. Extremely dense music or overlapping sounds can still confuse the router, and aggressive suppression can introduce artifacts depending on the recording.

Those limitations are intentional to state clearly. The project is trying to make selective browser audio protection practical in real time, not claim perfect source separation for every possible sound.

## Demo

A fast demo takes about a minute:

1. Play a clip with speech plus an alarm, glass break, clatter, or steady noise.
2. Click the AudioShield toolbar icon.
3. Toggle the matching sensory profile and move its strength from 0% to 100%.
4. Use **Bypass protection** to compare against the original.
5. Show Sensory X-Ray reacting while the clip plays.

The strongest demo is not a dashboard. It is hearing the nuisance sound become much less dominant while the voice stays usable.

## License

AudioShield is released under the MIT License. Third-party components and notices are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
