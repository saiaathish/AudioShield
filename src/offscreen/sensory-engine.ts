import type { SensoryEvent } from "../shared/events/types";
import type { TriggerId, TriggerRule } from "../shared/settings/types";
import {
  clamp,
  computeDynamicProfile,
  computeFrameStats,
  computeSensoryRoutes,
  continuousNeuralMix,
  findToneCandidates,
  neuralDelaySeconds,
  strengthToUnit,
  updateEnvelope,
  updateToneTracker,
  type EventEnvelopes,
  type FrameStats,
  type SensoryRoutes,
  type ToneTracker,
} from "./perceptual-control";

export type SensoryEngineName = "gtcrn" | "rnnoise" | "native-sensory";

export interface SensoryGraph {
  readonly engine: SensoryEngineName;
  setRules(rules: readonly TriggerRule[], masterStrength: number): void;
  setBypass(enabled: boolean): void;
  destroy(): void;
}

type DestroyableAudioNode = AudioNode & { destroy?: () => void };
type EmitEvent = (event: SensoryEvent) => void;

function setParam(param: AudioParam, value: number, context: AudioContext, timeConstant = 0.015): void {
  const safe = Number.isFinite(value) ? value : param.value;
  try {
    param.cancelScheduledValues(context.currentTime);
    param.setTargetAtTime(safe, context.currentTime, timeConstant);
  } catch {
    param.value = safe;
  }
}

async function createNeuralNode(context: AudioContext): Promise<{ node: DestroyableAudioNode; engine: SensoryEngineName } | null> {
  const url = (path: string) => chrome.runtime.getURL(path);
  const suppressor = await import("@sapphi-red/web-noise-suppressor");

  try {
    const wasmBinary = await suppressor.loadGtcrn({ url: url("vendor/gtcrn.wasm") });
    await context.audioWorklet.addModule(url("vendor/gtcrn-worklet.js"));
    return {
      node: new suppressor.GtcrnWorkletNode(context, { wasmBinary, maxChannels: 2 }),
      engine: "gtcrn",
    };
  } catch (gtcrnError) {
    console.warn("[AudioShield][neural] GTCRN unavailable; trying RNNoise", gtcrnError);
  }

  try {
    const wasmBinary = await suppressor.loadRnnoise({
      url: url("vendor/rnnoise.wasm"),
      simdUrl: url("vendor/rnnoise_simd.wasm"),
    });
    await context.audioWorklet.addModule(url("vendor/rnnoise-worklet.js"));
    return {
      node: new suppressor.RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 2 }),
      engine: "rnnoise",
    };
  } catch (rnnoiseError) {
    console.warn("[AudioShield][neural] RNNoise unavailable; using native sensory DSP", rnnoiseError);
    return null;
  }
}

/**
 * AudioShield v3: competitive event routing.
 *
 * The neural denoiser is no longer allowed to claim every suppressible sound as
 * "background noise". A temporal router classifies foreground structure first:
 * persistent tones -> alarms, high-flux/ultra-high transients -> glass,
 * broadband impacts -> clatter, dense bursts -> applause/loudness. Foreground
 * confidence pre-empts the background route, then each dedicated control acts.
 *
 * Protection strength is linear from 0-100. The neural dry path is delayed to
 * match the packaged GTCRN/RNNoise worklets, allowing continuous dry/wet
 * blending without the comb filtering that an unaligned parallel path creates.
 */
export async function createSensoryGraph(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  tabId: number,
  emitEvent: EmitEvent,
): Promise<SensoryGraph> {
  const neural = await createNeuralNode(context);
  const engine: SensoryEngineName = neural?.engine ?? "native-sensory";
  const alignmentDelaySeconds = neuralDelaySeconds(engine, context.sampleRate);

  const bypassDelay = context.createDelay(0.05);
  const bypassGain = context.createGain();
  const wetGain = context.createGain();
  const neuralDryDelay = context.createDelay(0.05);
  const neuralDryGain = context.createGain();
  const neuralWetGain = context.createGain();
  const merge = context.createGain();
  const presence = context.createBiquadFilter();
  const harshShelf = context.createBiquadFilter();
  const toneA = context.createBiquadFilter();
  const toneB = context.createBiquadFilter();
  const toneC = context.createBiquadFilter();
  const transientGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const limiter = context.createDynamicsCompressor();
  const analyser = context.createAnalyser();
  const analysisSink = context.createGain();

  bypassDelay.delayTime.value = alignmentDelaySeconds;
  neuralDryDelay.delayTime.value = alignmentDelaySeconds;
  bypassGain.gain.value = 0;
  wetGain.gain.value = 1;
  neuralDryGain.gain.value = 1;
  neuralWetGain.gain.value = 0;
  transientGain.gain.value = 1;
  analysisSink.gain.value = 0;

  presence.type = "peaking";
  presence.frequency.value = 2200;
  presence.Q.value = 0.72;
  presence.gain.value = 0;

  harshShelf.type = "highshelf";
  harshShelf.frequency.value = 3900;
  harshShelf.gain.value = 0;

  for (const tone of [toneA, toneB, toneC]) {
    tone.type = "peaking";
    tone.frequency.value = 1200;
    tone.Q.value = 12;
    tone.gain.value = 0;
  }

  // Exact 0% must be transparent. Dynamics increase continuously from here.
  compressor.threshold.value = 0;
  compressor.knee.value = 8;
  compressor.ratio.value = 1;
  compressor.attack.value = 0.010;
  compressor.release.value = 0.095;

  limiter.threshold.value = 0;
  limiter.knee.value = 0;
  limiter.ratio.value = 1;
  limiter.attack.value = 0.0015;
  limiter.release.value = 0.06;

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.52;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -8;

  // Bypass uses the same alignment delay as the protected path so toggling it
  // does not create a short echo/flange against a latency-bearing neural path.
  source.connect(bypassDelay);
  bypassDelay.connect(bypassGain);
  bypassGain.connect(context.destination);

  // Delay-aligned dry + neural wet branches give every slider percentage a
  // real, continuous amount of neural influence rather than an on/off knee.
  source.connect(neuralDryDelay);
  neuralDryDelay.connect(neuralDryGain);
  neuralDryGain.connect(merge);
  if (neural) {
    source.connect(neural.node);
    neural.node.connect(neuralWetGain);
    neuralWetGain.connect(merge);
  }

  merge.connect(presence);
  presence.connect(harshShelf);
  harshShelf.connect(toneA);
  toneA.connect(toneB);
  toneB.connect(toneC);
  toneC.connect(transientGain);
  transientGain.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(wetGain);
  wetGain.connect(context.destination);

  source.connect(analyser);
  analyser.connect(analysisSink);
  analysisSink.connect(context.destination);

  let destroyed = false;
  let masterStrength = 65;
  let rules: readonly TriggerRule[] = [];
  let lastStats: FrameStats | undefined;
  let currentNeuralMix = 0;
  let envelopes: EventEnvelopes = { glass: 0, clatter: 0, applause: 0, loudness: 0 };
  let lastRoutes: SensoryRoutes = {
    background: 0,
    alarm: 0,
    glass: 0,
    clatter: 0,
    applause: 0,
    harsh: 0,
    loudness: 0,
    foregroundDominance: 0,
  };
  let toneTrackers: [ToneTracker, ToneTracker, ToneTracker] = [
    { frequencyHz: 0, confidence: 0, persistence: 0 },
    { frequencyHz: 0, confidence: 0, persistence: 0 },
    { frequencyHz: 0, confidence: 0, persistence: 0 },
  ];

  const lastEventAt = new Map<TriggerId, number>();
  const frequencies = new Float32Array(analyser.frequencyBinCount);
  const previousFrequencies = new Float32Array(analyser.frequencyBinCount);
  let hasPreviousSpectrum = false;
  const waveform = new Float32Array(analyser.fftSize);

  const getRule = (id: TriggerId) => rules.find((rule) => rule.id === id);
  const effective = (id: TriggerId) => {
    const rule = getRule(id);
    if (!rule?.enabled) return 0;
    return clamp(rule.strength, 0, 100) * clamp(masterStrength, 0, 100) / 100;
  };

  const maybeEmit = (id: TriggerId, confidence: number, attenuationDb?: number, dominantFrequencyHz?: number) => {
    const now = Date.now();
    if (now - (lastEventAt.get(id) ?? 0) < 420) return;
    lastEventAt.set(id, now);
    emitEvent({
      triggerId: id,
      confidence: clamp(confidence),
      timestamp: now,
      tabId,
      attenuationDb,
      dominantFrequencyHz,
      active: true,
    });
  };

  const applyNeuralRouting = () => {
    if (!neural) {
      currentNeuralMix = 0;
      setParam(neuralDryGain.gain, 1, context, 0.02);
      return;
    }
    currentNeuralMix = continuousNeuralMix(effective("background-noise"), lastRoutes.background);
    setParam(neuralWetGain.gain, currentNeuralMix, context, 0.024);
    setParam(neuralDryGain.gain, 1 - currentNeuralMix, context, 0.024);
  };

  const applyDynamicProfile = (stats: FrameStats) => {
    const profile = computeDynamicProfile({
      harshStrength: effective("harsh-highs"),
      glassStrength: effective("glass-shatter"),
      clatterStrength: effective("dishes-clatter"),
      applauseStrength: effective("applause"),
      loudnessStrength: effective("sudden-loudness"),
      backgroundStrength: effective("background-noise"),
      stats,
      envelopes,
      routes: lastRoutes,
      neuralMix: currentNeuralMix,
    });

    setParam(presence.gain, profile.presenceDb, context, 0.055);
    setParam(harshShelf.gain, profile.highShelfDb, context, 0.038);
    setParam(transientGain.gain, profile.transientGain, context, 0.014);
    setParam(compressor.threshold, profile.compressorThresholdDb, context, 0.028);
    setParam(compressor.ratio, profile.compressorRatio, context, 0.028);
    setParam(compressor.attack, profile.compressorAttack, context, 0.028);
    setParam(compressor.release, profile.compressorRelease, context, 0.045);
    setParam(limiter.threshold, profile.limiterThresholdDb, context, 0.03);
    setParam(limiter.ratio, profile.limiterRatio, context, 0.03);
  };

  const applyRules = () => {
    applyNeuralRouting();
    if (lastStats) applyDynamicProfile(lastStats);
  };

  const analyze = () => {
    if (destroyed) return;
    analyser.getFloatFrequencyData(frequencies);
    analyser.getFloatTimeDomainData(waveform);

    const stats = computeFrameStats(
      frequencies,
      waveform,
      context.sampleRate,
      analyser.fftSize,
      hasPreviousSpectrum ? previousFrequencies : undefined,
    );
    previousFrequencies.set(frequencies);
    hasPreviousSpectrum = true;
    lastStats = stats;

    const candidates = findToneCandidates(frequencies, context.sampleRate, analyser.fftSize, 3);
    toneTrackers = [
      updateToneTracker(toneTrackers[0], candidates[0]),
      updateToneTracker(toneTrackers[1], candidates[1]),
      updateToneTracker(toneTrackers[2], candidates[2]),
    ];
    lastRoutes = computeSensoryRoutes(stats, toneTrackers);

    const glassStrength = effective("glass-shatter");
    const clatterStrength = effective("dishes-clatter");
    const applauseStrength = effective("applause");
    const loudnessStrength = effective("sudden-loudness");

    envelopes = {
      glass: updateEnvelope(envelopes.glass, glassStrength > 0 ? lastRoutes.glass : 0, 0.48),
      clatter: updateEnvelope(envelopes.clatter, clatterStrength > 0 ? lastRoutes.clatter : 0, 0.67),
      applause: updateEnvelope(envelopes.applause, applauseStrength > 0 ? lastRoutes.applause : 0, 0.84),
      loudness: updateEnvelope(envelopes.loudness, loudnessStrength > 0 ? lastRoutes.loudness : 0, 0.70),
    };

    // Foreground routing is decided before the broad neural mix is updated.
    // Alarm/glass confidence therefore immediately pushes background denoising
    // out of the way and lets the dedicated event controls own the attenuation.
    applyNeuralRouting();

    if (effective("background-noise") > 0 && currentNeuralMix > 0.01 && lastRoutes.background >= 0.24) {
      maybeEmit("background-noise", lastRoutes.background);
    }
    if (glassStrength > 0 && lastRoutes.glass >= 0.18) {
      maybeEmit("glass-shatter", lastRoutes.glass, -7.5 * envelopes.glass * strengthToUnit(glassStrength));
    }
    if (clatterStrength > 0 && lastRoutes.clatter >= 0.20) {
      maybeEmit("dishes-clatter", lastRoutes.clatter, -6 * envelopes.clatter * strengthToUnit(clatterStrength));
    }
    if (applauseStrength > 0 && lastRoutes.applause >= 0.24) {
      maybeEmit("applause", lastRoutes.applause, -4.5 * envelopes.applause * strengthToUnit(applauseStrength));
    }
    if (loudnessStrength > 0 && lastRoutes.loudness >= 0.24) {
      maybeEmit("sudden-loudness", lastRoutes.loudness, -5.5 * envelopes.loudness * strengthToUnit(loudnessStrength));
    }

    const alarmStrength = effective("alarm-siren");
    const alarmUnit = strengthToUnit(alarmStrength);
    const tones = [toneA, toneB, toneC];
    for (let index = 0; index < tones.length; index += 1) {
      const tracker = toneTrackers[index];
      const tone = tones[index];
      const stable = tracker.persistence >= 2 && tracker.confidence >= 0.12;
      if (stable && alarmUnit > 0) {
        const speechGuard = 1 - stats.speechLikelihood * 0.30;
        const persistence = clamp((tracker.persistence - 1) / 5);
        const routeWeight = Math.max(lastRoutes.alarm, tracker.confidence * persistence);
        // No fixed minimum attenuation: 1% really is ~1/100th of 100%.
        const attenuation = -20 * alarmUnit * routeWeight * speechGuard;
        setParam(tone.frequency, tracker.frequencyHz, context, 0.020);
        setParam(tone.Q, 10 + tracker.confidence * 11, context, 0.025);
        setParam(tone.gain, attenuation, context, 0.022);
        if (index === 0 && routeWeight >= 0.14) {
          maybeEmit("alarm-siren", routeWeight, attenuation, tracker.frequencyHz);
        }
      } else {
        setParam(tone.gain, 0, context, 0.042);
      }
    }

    applyDynamicProfile(stats);
  };

  const timer = globalThis.setInterval(analyze, 70);

  return {
    engine,
    setRules(nextRules, nextMasterStrength) {
      rules = nextRules;
      masterStrength = clamp(nextMasterStrength, 0, 100);
      applyRules();
    },
    setBypass(enabled) {
      setParam(bypassGain.gain, enabled ? 1 : 0, context, 0.014);
      setParam(wetGain.gain, enabled ? 0 : 1, context, 0.014);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearInterval(timer);
      try { source.disconnect(bypassDelay); } catch { /* disconnected */ }
      try { source.disconnect(neuralDryDelay); } catch { /* disconnected */ }
      try { source.disconnect(analyser); } catch { /* disconnected */ }
      try { if (neural) source.disconnect(neural.node); } catch { /* disconnected */ }
      for (const node of [
        bypassDelay,
        bypassGain,
        wetGain,
        neuralDryDelay,
        neuralDryGain,
        neuralWetGain,
        merge,
        presence,
        harshShelf,
        toneA,
        toneB,
        toneC,
        transientGain,
        compressor,
        limiter,
        analyser,
        analysisSink,
      ]) {
        try { node.disconnect(); } catch { /* disconnected */ }
      }
      try { neural?.node.disconnect(); } catch { /* disconnected */ }
      try { neural?.node.destroy?.(); } catch { /* cleanup */ }
    },
  };
}
