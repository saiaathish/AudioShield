import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const FIXTURE_SPEC = Object.freeze({
  id: "semantic-hearing-speech-dishes-v1",
  seed: 7331,
  sampleRateHz: 44_100,
  durationSeconds: 1,
  channels: 2,
  speechDescription: "deterministic voiced harmonic stem with syllabic envelope",
  dishesDescription: "deterministic high-frequency transient clatter stem",
  mixture: "speech + dishes, channel-aligned sum",
});

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function makeSpeech(sampleCount, sampleRateHz, seed) {
  const next = random(seed);
  const output = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRateHz;
    const syllable = 0.55 + 0.45 * Math.max(0, Math.sin(2 * Math.PI * 3.2 * t));
    output[i] = syllable * (
      0.20 * Math.sin(2 * Math.PI * 145 * t) +
      0.11 * Math.sin(2 * Math.PI * 290 * t) +
      0.07 * Math.sin(2 * Math.PI * 435 * t) +
      (next() - 0.5) * 0.035
    );
  }
  return output;
}

function makeDishes(sampleCount, sampleRateHz, seed) {
  const next = random(seed);
  const output = new Float32Array(sampleCount);
  for (let burst = 0; burst < 11; burst += 1) {
    const at = Math.floor((0.07 + burst * 0.083 + next() * 0.025) * sampleRateHz);
    const length = Math.floor((0.025 + next() * 0.02) * sampleRateHz);
    const frequency = 2600 + next() * 4200;
    for (let j = 0; j < length && at + j < sampleCount; j += 1) {
      const envelope = Math.exp(-j / (length * 0.23));
      output[at + j] += envelope * (
        0.48 * Math.sin(2 * Math.PI * frequency * j / sampleRateHz) +
        0.18 * Math.sin(2 * Math.PI * (frequency + 700) * j / sampleRateHz)
      );
    }
  }
  return output;
}

function writeStereoWav(channels, sampleRateHz) {
  const sampleCount = channels[0].length;
  const bytesPerSample = 2;
  const dataSize = sampleCount * channels.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels.length, 22);
  buffer.writeUInt32LE(sampleRateHz, 24);
  buffer.writeUInt32LE(sampleRateHz * channels.length * bytesPerSample, 28);
  buffer.writeUInt16LE(channels.length * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < sampleCount; i += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      buffer.writeInt16LE(Math.round(sample * 32767), offset);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function writeFixedFixture(outputDir) {
  const sampleCount = FIXTURE_SPEC.sampleRateHz * FIXTURE_SPEC.durationSeconds;
  const speech = makeSpeech(sampleCount, FIXTURE_SPEC.sampleRateHz, FIXTURE_SPEC.seed);
  const dishes = makeDishes(sampleCount, FIXTURE_SPEC.sampleRateHz, FIXTURE_SPEC.seed + 100);
  const mixture = Float32Array.from(speech, (value, index) => value + dishes[index]);
  const artifacts = {
    speech: writeStereoWav([speech, speech], FIXTURE_SPEC.sampleRateHz),
    dishes: writeStereoWav([dishes, dishes], FIXTURE_SPEC.sampleRateHz),
    mixture: writeStereoWav([mixture, mixture], FIXTURE_SPEC.sampleRateHz),
  };

  await mkdir(outputDir, { recursive: true });
  const files = {};
  for (const [name, buffer] of Object.entries(artifacts)) {
    const filename = `${name}.wav`;
    await writeFile(path.join(outputDir, filename), buffer);
    files[name] = { path: filename, bytes: buffer.length, sha256: sha256(buffer) };
  }

  const manifest = { schemaVersion: 1, fixture: FIXTURE_SPEC, files };
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
