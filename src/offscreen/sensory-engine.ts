import {
  GtcrnWorkletNode,
  RnnoiseWorkletNode,
  loadGtcrn,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import type { SensoryEvent } from "../shared/events/types";
import type { TriggerId, TriggerRule } from "../shared/settings/types";

export type SensoryEngineName = "gtcrn" | "rnnoise" | "native-sensory";

export interface SensoryGraph {
  readonly engine: SensoryEngineName;
  setRules(rules: readonly TriggerRule[], masterStrength: number): void;
  setBypass(enabled: boolean): void;
  destroy(): void;
}

type DestroyableAudioNode = AudioNode & { destroy?: () => void };
type EmitEvent = (event: SensoryEvent) => void;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const dbToPower = (db: number) => 10 ** (db / 10);

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

  try {
    const wasmBinary = await loadGtcrn({ url: url("vendor/gtcrn.wasm") });
    await context.audioWorklet.addModule(url("vendor/gtcrn-worklet.js"));
    return {
      node: new GtcrnWorkletNode(context, { wasmBinary, maxChannels: 2 }),
      engine: "gtcrn",
    };
  } catch (gtcrnError) {
    console.warn("[AudioShield][neural] GTCRN unavailable; trying RNNoise", gtcrnError);
  }

  try {
    const wasmBinary = await loadRnnoise({
      url: url("vendor/rnnoise.wasm"),
      simdUrl: url("vendor/rnnoise_simd.wasm"),
    });
    await context.audioWorklet.addModule(url("vendor/rnnoise-worklet.js"));
    return {
      node: new RnnoiseWorkletNode(context, { wasmBinary, maxChannels: 2 }),
      engine: "rnnoise",
    };
  } catch (rnnoiseError) {
    console.warn("[AudioShield][neural] RNNoise unavailable; using native sensory DSP", rnnoiseError);
    return null;
  }
}

/**
 * AudioShield's release graph deliberately avoids ScriptProcessorNode.
 *
 * The speech-preserving denoiser is provided by the MIT-licensed
 * @sapphi-red/web-noise-suppressor AudioWorklet package (GTCRN first,
 * RNNoise fallback). Perceptual sensory controls use browser-native Web Audio
 * nodes so heavy JS never runs in the realtime rendering callback.
 */
export async function createSensoryGraph(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  tabId: number,
  emitEvent: EmitEvent,
): Promise<SensoryGraph> {
  const neural = await createNeuralNode(context);

  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const neuralDryGain = context.createGain();
  const neuralWetGain = context.createGain();
  const merge = context.createGain();
  const harshShelf = context.createBiquadFilter();
  const toneA = context.createBiquadFilter();
  const toneB = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const analyser = context.createAnalyser();
  const analysisSink = context.createGain();

  dryGain.gain.value = 0;
  wetGain.gain.value = 1;
  neuralDryGain.gain.value = neural ? 0 : 1;
  neuralWetGain.gain.value = neural ? 1 : 0;
  analysisSink.gain.value = 0;

  harshShelf.type = "highshelf";
  harshShelf.frequency.value = 3600;
  harshShelf.gain.value = -3;

  for (const tone of [toneA, toneB]) {
    tone.type = "peaking";
    tone.frequency.value = 1200;
    tone.Q.value = 12;
    tone.gain.value = 0;
  }

  compressor.threshold.value = -10;
  compressor.knee.value = 6;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.12;

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.62;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // Hard bypass branch. It stays connected so bypass never rebuilds the graph.
  source.connect(dryGain);
  dryGain.connect(context.destination);

  // Speech-preserving neural layer can be cross-switched without reconnecting.
  source.connect(neuralDryGain);
  neuralDryGain.connect(merge);
  if (neural) {
    source.connect(neural.node);
    neural.node.connect(neuralWetGain);
    neuralWetGain.connect(merge);
  }

  merge.connect(harshShelf);
  harshShelf.connect(toneA);
  toneA.connect(toneB);
  toneB.connect(compressor);
  compressor.connect(wetGain);
  wetGain.connect(context.destination);

  // Analysis is a zero-gain native branch. AnalyserNode performs its FFT in the
  // browser engine, avoiding the expensive JS DFT that caused audible underruns.
  source.connect(analyser);
  analyser.connect(analysisSink);
  analysisSink.connect(context.destination);

  let destroyed = false;
  let masterStrength = 65;
  let rules: readonly TriggerRule[] = [];
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
      confidence: clamp(confidence, 0, 1),
      timestamp: now,
      tabId,
      attenuationDb,
      dominantFrequencyHz,
      active: true,
    });
  };

  const applyRules = () => {
    const neuralStrength = effective("background-noise");
    if (neural) {
      setParam(neuralWetGain.gain, neuralStrength > 0 ? 1 : 0, context, 0.025);
      setParam(neuralDryGain.gain, neuralStrength > 0 ? 0 : 1, context, 0.025);
    }

    const harsh = effective("harsh-highs");
    const clatter = effective("dishes-clatter");
    const applause = effective("applause");
    const highBandCut = -Math.min(14, harsh * 0.09 + clatter * 0.045 + applause * 0.025);
    setParam(harshShelf.gain, highBandCut, context, 0.03);

    const loudness = effective("sudden-loudness");
    const impact = Math.max(clatter, applause, loudness);
    setParam(compressor.threshold, -8 - impact * 0.20, context, 0.03);
    setParam(compressor.ratio, 1.5 + impact * 0.085, context, 0.03);
    setParam(compressor.attack, Math.max(0.0015, 0.008 - impact * 0.00006), context, 0.03);
    setParam(compressor.release, 0.09 + impact * 0.0011, context, 0.03);
  };

  const analyze = () => {
    if (destroyed) return;
    analyser.getFloatFrequencyData(frequencies);
    analyser.getFloatTimeDomainData(waveform);

    const sampleRate = context.sampleRate;
    const binHz = sampleRate / analyser.fftSize;
    const alarmStrength = effective("alarm-siren");
    const lower = Math.max(1, Math.floor(650 / binHz));
    const upper = Math.min(frequencies.length - 2, Math.ceil(5200 / binHz));
    const candidates: Array<{ bin: number; score: number; level: number }> = [];

    for (let bin = lower + 4; bin < upper - 4; bin += 1) {
      const level = frequencies[bin] ?? -120;
      if (!Number.isFinite(level) || level < -58) continue;
      let neighbor = 0;
      let count = 0;
      for (let offset = -5; offset <= 5; offset += 1) {
        if (Math.abs(offset) <= 1) continue;
        const value = frequencies[bin + offset];
        if (Number.isFinite(value)) { neighbor += value; count += 1; }
      }
      if (!count) continue;
      const score = level - neighbor / count;
      if (score >= 7.5) candidates.push({ bin, score, level });
    }

    candidates.sort((a, b) => b.score - a.score);
    const first = candidates[0];
    const second = candidates.find((candidate) => first && Math.abs(candidate.bin - first.bin) * binHz > 180);
    const selected = [first, second].filter(Boolean) as Array<{ bin: number; score: number; level: number }>;
    const tones = [toneA, toneB];

    for (let index = 0; index < tones.length; index += 1) {
      const candidate = selected[index];
      const tone = tones[index];
      if (candidate && alarmStrength > 0) {
        const frequency = candidate.bin * binHz;
        const confidence = clamp((candidate.score - 7.5) / 15, 0, 1);
        const attenuation = -Math.min(20, 3 + alarmStrength * 0.17 * (0.55 + confidence * 0.45));
        setParam(tone.frequency, frequency, context, 0.018);
        setParam(tone.Q, 9 + confidence * 10, context, 0.018);
        setParam(tone.gain, attenuation, context, 0.018);
        if (index === 0 && confidence >= 0.22) maybeEmit("alarm-siren", confidence, attenuation, frequency);
      } else {
        setParam(tone.gain, 0, context, 0.04);
      }
    }

    let peak = 0;
    let sumSq = 0;
    for (const sample of waveform) {
      const abs = Math.abs(sample);
      peak = Math.max(peak, abs);
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, waveform.length));
    const crest = peak / Math.max(1e-5, rms);

    let highPower = 0;
    let midPower = 0;
    let highBins = 0;
    let midBins = 0;
    for (let bin = 1; bin < frequencies.length; bin += 1) {
      const hz = bin * binHz;
      const value = frequencies[bin] ?? -120;
      if (!Number.isFinite(value)) continue;
      if (hz >= 2400 && hz <= 10500) { highPower += dbToPower(value); highBins += 1; }
      else if (hz >= 180 && hz < 2400) { midPower += dbToPower(value); midBins += 1; }
    }
    const highAverage = highPower / Math.max(1, highBins);
    const midAverage = midPower / Math.max(1, midBins);
    const highRatio = highAverage / Math.max(1e-12, highAverage + midAverage);
    const clatterStrength = effective("dishes-clatter");
    if (clatterStrength > 0 && peak > 0.18 && crest > 3.1 && highRatio > 0.34) {
      const confidence = clamp((crest - 3.1) / 5 + (highRatio - 0.34) * 1.3, 0, 1);
      maybeEmit("dishes-clatter", confidence, harshShelf.gain.value);
    }

    const reduction = compressor.reduction;
    if (effective("sudden-loudness") > 0 && Number.isFinite(reduction) && reduction < -2.5) {
      maybeEmit("sudden-loudness", clamp(Math.abs(reduction) / 16, 0, 1), reduction);
    }
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
      setParam(dryGain.gain, enabled ? 1 : 0, context, 0.012);
      setParam(wetGain.gain, enabled ? 0 : 1, context, 0.012);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearInterval(timer);
      try { source.disconnect(dryGain); } catch { /* disconnected */ }
      try { source.disconnect(neuralDryGain); } catch { /* disconnected */ }
      try { source.disconnect(analyser); } catch { /* disconnected */ }
      try { if (neural) source.disconnect(neural.node); } catch { /* disconnected */ }
      for (const node of [dryGain, wetGain, neuralDryGain, neuralWetGain, merge, harshShelf, toneA, toneB, compressor, analyser, analysisSink]) {
        try { node.disconnect(); } catch { /* disconnected */ }
      }
      try { neural?.node.disconnect(); } catch { /* disconnected */ }
      try { neural?.node.destroy?.(); } catch { /* cleanup */ }
    },
  };
}
