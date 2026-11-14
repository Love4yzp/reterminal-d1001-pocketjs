import { createWavPlayer, type WavPcm } from "@pocketjs/framework/audio";

export type OpsSoundKind = "tap" | "alarm";

const SAMPLE_RATE = 22050;
const LEAD_FRAMES = Math.round(0.012 * SAMPLE_RATE);

function buildTonePcm(durationSec: number, f1: number, f2: number, amplitude: number): WavPcm {
  const toneFrames = Math.round(durationSec * SAMPLE_RATE);
  const frames = LEAD_FRAMES + toneFrames;
  const data = new Int16Array(frames);
  const attackFrames = Math.max(1, Math.round(0.004 * SAMPLE_RATE));
  const decayFrames = Math.max(1, toneFrames - attackFrames);
  const w1 = 2 * Math.PI * f1;
  const w2 = 2 * Math.PI * f2;
  for (let i = 0; i < toneFrames; i += 1) {
    const attack = i < attackFrames ? Math.sin((Math.PI / 2) * (i / attackFrames)) : 1;
    const decay = i < attackFrames ? 1 : Math.exp(-4.5 * ((i - attackFrames) / decayFrames));
    const t = i / SAMPLE_RATE;
    const wave = 0.65 * Math.sin(w1 * t) + 0.35 * Math.sin(w2 * t);
    data[LEAD_FRAMES + i] = Math.max(-32768, Math.min(32767, Math.round(amplitude * attack * decay * wave * 32767)));
  }
  return { sampleRate: SAMPLE_RATE, channels: 1, frames, data };
}

const tapPcm = buildTonePcm(0.03, 1800, 2700, 0.55);
const alarmPcm = buildTonePcm(0.14, 980, 1470, 0.75);

const player = createWavPlayer();
player.setVolume(1);
let ready = player.loadPcm(tapPcm);
let loadedKind: OpsSoundKind = "tap";

export function playOpsSound(kind: OpsSoundKind, muted = false): void {
  if (!ready || (kind === "alarm" && muted)) return;
  if (kind !== loadedKind) {
    ready = player.loadPcm(kind === "alarm" ? alarmPcm : tapPcm);
    loadedKind = kind;
    if (!ready) return;
  }
  player.stop();
  player.play();
}

export function pumpOpsAudio(): void {
  if (ready) player.pump();
}
