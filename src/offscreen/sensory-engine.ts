import type { SensoryEvent } from "../shared/events/types";
import type { TriggerId, TriggerRule } from "../shared/settings/types";
import {
  clamp,
  computeDynamicProfile,
  computeFrameStats,
  findToneCandidates,
  updateEnvelope,
  updateToneTracker,
  type EventEnvelopes,
  type FrameStats,
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
 * AudioShield v2 quality graph.
 *
 * Layer 1: GTCRN AudioWorklet neural denoising, with RNNoise fallback.
 * Layer 2: event-adaptive sensory suppression. Clatter, applause and loudness
 *          no longer impose permanent EQ/compression on clean content.
 * Layer 3: transparent post-processing: presence recovery + safety limiting.
 *
 * Heavy realtime work stays in native Web Audio / AudioWorklet. The JS timer
 * only updates control-rate parameters and never touches PCM render callbacks.
 */
export async function createSensoryGraph(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  tabId: number,
  emitEvent: EmitEvent,
): Promise<SensoryGraph> {
  const neural = await createNeuralNode(context);

  const bypassGain = context.createGain();
  const wetGain = context.createGain();
  const neuralDryGain = context.createGain();
  const neuralWetGain = context.createGain();
  const merge = context.createGain();
  const presence = context.createBiquadFilter();
  const harshShelf = context.createBiquadFilter();
  const toneA = context.createBiquadFilter();
  const toneB = context.createBiquadFilter();
  const transientGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const limiter = context.createDynamicsCompressor();
  const analyser = context.createAnalyser();
  const analysisSink = context.createGain();

  bypassGain.gain.value = 0;
  wetGain.gain.value = 1;
  neuralDryGain.gain.value = neural ? 0 : 1;
  neuralWetGain.gain.value = neural ? 1 : 0;
  transientGain.gain.value = 1;
  analysisSink.gain.value = 0;

  presence.type = "peaking";
  presence.frequency.value = 2200;
  presence.Q.value = 0.72;
  presence.gain.value = 0;

  harshShelf.type = "highshelf";
  harshShelf.frequency.value = 3800;
  harshShelf.gain.value = 0;

  for (const tone of [toneA, toneB]) {
    tone.type = "peaking";
    tone.frequency.value = 1200;
    tone.Q.value = 12;
    tone.gain.value = 0;
  }

  // The old graph held aggressive compression whenever a trigger was enabled.
  // v2 idles almost transparent and raises compression only around actual events.
  compressor.threshold.value = -5.5;
  compressor.knee.value = 8;
  compressor.ratio.value = 1.25;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.11;

  // Safety limiter catches post-EQ peaks without acting as the primary compressor.
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.0015;
  limiter.release.value = 0.06;

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.58;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -8;

  // Bypass remains permanently wired. We only crossfade gains; no graph rebuild.
  source.connect(bypassGain);
  bypassGain.connect(context.destination);

  source.connect(neuralDryGain);
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
  toneB.connect(transientGain);
  transientGain.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(wetGain);
  wetGain.connect(context.destination);

  // Zero-gain analyser branch keeps detection off the realtime render callback.
  source.connect(analyser);
  analyser.connect(analysisSink);
  analysisSink.connect(context.destination);

  let destroyed = false;
  let masterStrength = 65;
  let rules: readonly TriggerRule[] = [];
  let lastStats: FrameStats | undefined;
  let envelopes: EventEnvelopes = { clatter: 0, applause: 0, loudness: 0 };
  let toneTrackers: [ToneTracker, ToneTracker] = [
    { frequencyHz: 0, confidence: 0, persistence: 0 },
    { frequencyHz: 0, confidence: 0, persistence: 0 },
  ];

  const lastEventAt = new Map<TriggerId, number>();
  const frequencies = new Float32Array(analyser.frequencyBinCount);
  const waveform = new Float32Array(analyser.fftSize);

  const getRule = (id: TriggerId) => rules.find((rule) => rule.id === id);
  const effective = (id: TriggerId) => {
    const rule = getRule(id);
    if (!rule?.enabled) return 0;
    return clamp(rule.strength, 0, 100) * clamp(masterStrength, 0, 100) / 100;
  };

  const maybeEmit = (id: TriggerId, confidence: number, attenuationDb?: number, dominantFrequencyHz?: number) => {
    const now = Date.now();
    if (now - (lastEventAt.get(id) ?? 0) < 450) return;
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

  const neuralIsActive = () => Boolean(neural) && effective("background-noise") >= 8;

  const applyNeuralRouting = () => {
    if (!neural) return;
    const active = neuralIsActive();
    // GTCRN has algorithmic latency, so avoid a permanent dry/wet parallel blend
    // that would comb-filter speech. Use a smoothed route switch instead.
    setParam(neuralWetGain.gain, active ? 1 : 0, context, 0.035);
    setParam(neuralDryGain.gain, active ? 0 : 1, context, 0.035);
  };

  const applyDynamicProfile = (stats: FrameStats) => {
    const profile = computeDynamicProfile({
      harshStrength: effective("harsh-highs"),
      clatterStrength: effective("dishes-clatter"),
      applauseStrength: effective("applause"),
      loudnessStrength: effective("sudden-loudness"),
      backgroundStrength: effective("background-noise"),
      stats,
      envelopes,
      neuralActive: neuralIsActive(),
    });

    setParam(presence.gain, profile.presenceDb, context, 0.055);
    setParam(harshShelf.gain, profile.highShelfDb, context, 0.045);
    setParam(transientGain.gain, profile.transientGain, context, 0.018);
    setParam(compressor.threshold, profile.compressorThresholdDb, context, 0.035);
    setParam(compressor.ratio, profile.compressorRatio, context, 0.035);
    setParam(compressor.attack, profile.compressorAttack, context, 0.035);
    setParam(compressor.release, profile.compressorRelease, context, 0.055);
  };

  const applyRules = () => {
    applyNeuralRouting();
    if (lastStats) applyDynamicProfile(lastStats);
  };

  const analyze = () => {
    if (destroyed) return;
    analyser.getFloatFrequencyData(frequencies);
    analyser.getFloatTimeDomainData(waveform);

    const stats = computeFrameStats(frequencies, waveform, context.sampleRate, analyser.fftSize);
    lastStats = stats;

    const clatterStrength = effective("dishes-clatter");
    const applauseStrength = effective("applause");
    const loudnessStrength = effective("sudden-loudness");

    envelopes = {
      clatter: updateEnvelope(envelopes.clatter, clatterStrength > 0 ? stats.clatterConfidence : 0, 0.68),
      applause: updateEnvelope(envelopes.applause, applauseStrength > 0 ? stats.applauseConfidence : 0, 0.86),
      loudness: updateEnvelope(envelopes.loudness, loudnessStrength > 0 ? stats.loudnessConfidence : 0, 0.72),
    };

    if (clatterStrength > 0 && stats.clatterConfidence >= 0.22) {
      maybeEmit("dishes-clatter", stats.clatterConfidence, -6 * envelopes.clatter);
    }
    if (applauseStrength > 0 && stats.applauseConfidence >= 0.28) {
      maybeEmit("applause", stats.applauseConfidence, -4 * envelopes.applause);
    }
    if (loudnessStrength > 0 && stats.loudnessConfidence >= 0.28) {
      maybeEmit("sudden-loudness", stats.loudnessConfidence, -5 * envelopes.loudness);
    }

    const candidates = findToneCandidates(frequencies, context.sampleRate, analyser.fftSize, 2);
    toneTrackers = [
      updateToneTracker(toneTrackers[0], candidates[0]),
      updateToneTracker(toneTrackers[1], candidates[1]),
    ];

    const alarmStrength = effective("alarm-siren");
    const tones = [toneA, toneB];
    for (let index = 0; index < tones.length; index += 1) {
      const tracker = toneTrackers[index];
      const tone = tones[index];
      const stable = tracker.persistence >= 2 && tracker.confidence >= 0.16;
      if (stable && alarmStrength > 0) {
        const speechGuard = 1 - stats.speechLikelihood * 0.28;
        const persistenceBonus = clamp((tracker.persistence - 1) / 4);
        const attenuation = -Math.min(
          19,
          (2.5 + alarmStrength * 0.15 * (0.55 + tracker.confidence * 0.45)) *
            (0.78 + persistenceBonus * 0.22) * speechGuard,
        );
        setParam(tone.frequency, tracker.frequencyHz, context, 0.025);
        setParam(tone.Q, 10 + tracker.confidence * 9, context, 0.03);
        setParam(tone.gain, attenuation, context, 0.028);
        if (index === 0) maybeEmit("alarm-siren", tracker.confidence, attenuation, tracker.frequencyHz);
      } else {
        setParam(tone.gain, 0, context, 0.055);
      }
    }

    applyDynamicProfile(stats);
  };

  const timer = globalThis.setInterval(analyze, 80);

  return {
    engine: neural?.engine ?? "native-sensory",
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
      try { source.disconnect(bypassGain); } catch { /* disconnected */ }
      try { source.disconnect(neuralDryGain); } catch { /* disconnected */ }
      try { source.disconnect(analyser); } catch { /* disconnected */ }
      try { if (neural) source.disconnect(neural.node); } catch { /* disconnected */ }
      for (const node of [
        bypassGain,
        wetGain,
        neuralDryGain,
        neuralWetGain,
        merge,
        presence,
        harshShelf,
        toneA,
        toneB,
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
