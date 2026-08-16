import type { SensoryEvent } from "../shared/events/types";
import type { TriggerId, TriggerRule } from "../shared/settings/types";
import {
  clamp,
  composeProtectionStrength,
  computeDynamicProfile,
  computeFrameStats,
  computeSensoryRoutes,
  continuousNeuralMix,
  findToneCandidates,
  neuralDelaySeconds,
  perceptualDrive,
  routeDrive,
  updateEnvelope,
  updateToneTracker,
  type EventEnvelopes,
  type FrameStats,
  type SensoryRoutes,
  type ToneTracker,
} from "./perceptual-control";

export type SensoryEngineName = "gtcrn" | "rnnoise" | "native-sensory";

/** Guard delay gives the control path time to react before a transient is emitted. */
export const EVENT_LOOKAHEAD_SECONDS = 0.034;
/** Faster control cadence makes short foreground events materially actionable. */
export const ANALYSIS_INTERVAL_MS = 16;
export const ANALYSIS_FFT_SIZE = 1024;

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
 * AudioShield v5: decisive low-latency sensory routing.
 *
 * The previous graph was continuous but too timid because master strength,
 * profile strength, route score, event envelope, and speech guard all multiplied
 * down the final effect. This version keeps every percentage continuous while
 * making real foreground evidence produce an obvious targeted change.
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

  const bypassDelay = context.createDelay(0.09);
  const bypassGain = context.createGain();
  const wetGain = context.createGain();
  const neuralDryDelay = context.createDelay(0.05);
  const neuralDryGain = context.createGain();
  const neuralWetGain = context.createGain();
  const merge = context.createGain();
  const eventLookahead = context.createDelay(0.05);
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

  bypassDelay.delayTime.value = alignmentDelaySeconds + EVENT_LOOKAHEAD_SECONDS;
  neuralDryDelay.delayTime.value = alignmentDelaySeconds;
  eventLookahead.delayTime.value = EVENT_LOOKAHEAD_SECONDS;
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
    tone.Q.value = 8;
    tone.gain.value = 0;
  }

  compressor.threshold.value = 0;
  compressor.knee.value = 8;
  compressor.ratio.value = 1;
  compressor.attack.value = 0.0035;
  compressor.release.value = 0.095;

  limiter.threshold.value = 0;
  limiter.knee.value = 0;
  limiter.ratio.value = 1;
  limiter.attack.value = 0.0012;
  limiter.release.value = 0.06;

  analyser.fftSize = ANALYSIS_FFT_SIZE;
  analyser.smoothingTimeConstant = 0.05;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -8;

  source.connect(bypassDelay);
  bypassDelay.connect(bypassGain);
  bypassGain.connect(context.destination);

  source.connect(neuralDryDelay);
  neuralDryDelay.connect(neuralDryGain);
  neuralDryGain.connect(merge);
  if (neural) {
    source.connect(neural.node);
    neural.node.connect(neuralWetGain);
    neuralWetGain.connect(merge);
  }

  merge.connect(eventLookahead);
  eventLookahead.connect(presence);
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
    return composeProtectionStrength(rule.strength, masterStrength);
  };

  const maybeEmit = (id: TriggerId, routingScore: number, attenuationDb?: number, dominantFrequencyHz?: number) => {
    const now = Date.now();
    if (now - (lastEventAt.get(id) ?? 0) < 280) return;
    lastEventAt.set(id, now);
    emitEvent({
      triggerId: id,
      confidence: clamp(routingScore),
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
      setParam(neuralDryGain.gain, 1, context, 0.008);
      return;
    }
    currentNeuralMix = continuousNeuralMix(effective("background-noise"), lastRoutes.background);
    setParam(neuralWetGain.gain, currentNeuralMix, context, 0.010);
    setParam(neuralDryGain.gain, 1 - currentNeuralMix, context, 0.010);
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

    setParam(presence.gain, profile.presenceDb, context, 0.020);
    setParam(harshShelf.gain, profile.highShelfDb, context, 0.006);
    setParam(transientGain.gain, profile.transientGain, context, 0.0035);
    setParam(compressor.threshold, profile.compressorThresholdDb, context, 0.004);
    setParam(compressor.ratio, profile.compressorRatio, context, 0.004);
    setParam(compressor.attack, profile.compressorAttack, context, 0.004);
    setParam(compressor.release, profile.compressorRelease, context, 0.015);
    setParam(limiter.threshold, profile.limiterThresholdDb, context, 0.005);
    setParam(limiter.ratio, profile.limiterRatio, context, 0.005);
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
      glass: updateEnvelope(envelopes.glass, glassStrength > 0 ? lastRoutes.glass : 0, 0.54),
      clatter: updateEnvelope(envelopes.clatter, clatterStrength > 0 ? lastRoutes.clatter : 0, 0.66),
      applause: updateEnvelope(envelopes.applause, applauseStrength > 0 ? lastRoutes.applause : 0, 0.84),
      loudness: updateEnvelope(envelopes.loudness, loudnessStrength > 0 ? lastRoutes.loudness : 0, 0.70),
    };

    applyNeuralRouting();

    if (effective("background-noise") > 0 && currentNeuralMix > 0.01 && lastRoutes.background >= 0.14) {
      maybeEmit("background-noise", lastRoutes.background);
    }
    if (glassStrength > 0 && lastRoutes.glass >= 0.10) {
      maybeEmit("glass-shatter", lastRoutes.glass, -13 * envelopes.glass * perceptualDrive(glassStrength));
    }
    if (clatterStrength > 0 && lastRoutes.clatter >= 0.12) {
      maybeEmit("dishes-clatter", lastRoutes.clatter, -9 * envelopes.clatter * perceptualDrive(clatterStrength));
    }
    if (applauseStrength > 0 && lastRoutes.applause >= 0.16) {
      maybeEmit("applause", lastRoutes.applause, -6 * envelopes.applause * perceptualDrive(applauseStrength));
    }
    if (loudnessStrength > 0 && lastRoutes.loudness >= 0.14) {
      maybeEmit("sudden-loudness", lastRoutes.loudness, -9.5 * envelopes.loudness * perceptualDrive(loudnessStrength));
    }

    const alarmStrength = effective("alarm-siren");
    const alarmUnit = perceptualDrive(alarmStrength);
    const tones = [toneA, toneB, toneC];
    for (let index = 0; index < tones.length; index += 1) {
      const tracker = toneTrackers[index];
      const tone = tones[index];
      const stable = tracker.persistence >= 2 && tracker.confidence >= 0.08;
      if (stable && alarmUnit > 0) {
        const speechGuard = 1 - stats.speechLikelihood * 0.14;
        const persistence = clamp((tracker.persistence - 1) / 4);
        const trackerDrive = routeDrive(tracker.confidence * (0.45 + persistence * 0.55));
        const routeWeight = Math.max(lastRoutes.alarm, trackerDrive);
        const attenuation = -36 * alarmUnit * routeWeight * speechGuard;
        setParam(tone.frequency, tracker.frequencyHz, context, 0.0045);
        setParam(tone.Q, 5.5 + tracker.confidence * 6.5, context, 0.006);
        setParam(tone.gain, attenuation, context, 0.0045);
        if (index === 0 && routeWeight >= 0.10) {
          maybeEmit("alarm-siren", routeWeight, attenuation, tracker.frequencyHz);
        }
      } else {
        setParam(tone.gain, 0, context, 0.024);
      }
    }

    applyDynamicProfile(stats);
  };

  const timer = globalThis.setInterval(analyze, ANALYSIS_INTERVAL_MS);

  return {
    engine,
    setRules(nextRules, nextMasterStrength) {
      rules = nextRules;
      masterStrength = clamp(nextMasterStrength, 0, 100);
      applyRules();
    },
    setBypass(enabled) {
      setParam(bypassGain.gain, enabled ? 1 : 0, context, 0.010);
      setParam(wetGain.gain, enabled ? 0 : 1, context, 0.010);
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
        eventLookahead,
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
