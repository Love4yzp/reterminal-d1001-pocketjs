import { createWavPlayer, type WavPcm } from "@pocketjs/framework/audio";

export type UiFeedbackKind = "tap";
export type UiFeedbackListener = (kind: UiFeedbackKind) => void;

export const UI_SOUND_SAMPLE_RATE = 22050;
export const UI_SOUND_LEAD_FRAMES = Math.round(0.012 * UI_SOUND_SAMPLE_RATE);
export const UI_SOUND_CLICK_FRAMES = Math.round(0.030 * UI_SOUND_SAMPLE_RATE);

const CLICK_AMPLITUDE = 0.6;
const ATTACK_FRAMES = Math.max(1, Math.round(0.003 * UI_SOUND_SAMPLE_RATE));
const TONE_1800 = 2 * Math.PI * 1800;
const TONE_2700 = 2 * Math.PI * 2700;

/**
 * A short, bright click preceded by 12 ms of silence. The D1001 speaker
 * amplifier powers on with EN_PA and can clip the first few milliseconds;
 * the lead keeps the transient intact.
 */
export function buildTapPcm(): WavPcm {
  const frames = UI_SOUND_LEAD_FRAMES + UI_SOUND_CLICK_FRAMES;
  const data = new Int16Array(frames);
  const decayFrames = UI_SOUND_CLICK_FRAMES - ATTACK_FRAMES;
  for (let i = 0; i < UI_SOUND_CLICK_FRAMES; i += 1) {
    const attack = i < ATTACK_FRAMES ? Math.sin((Math.PI / 2) * (i / ATTACK_FRAMES)) : 1;
    const decay = i < ATTACK_FRAMES
      ? 1
      : Math.exp(-5 * ((i - ATTACK_FRAMES) / decayFrames));
    const t = i / UI_SOUND_SAMPLE_RATE;
    const tone = 0.65 * Math.sin(TONE_1800 * t) + 0.35 * Math.sin(TONE_2700 * t);
    const sample = CLICK_AMPLITUDE * attack * decay * tone * 32767;
    data[UI_SOUND_LEAD_FRAMES + i] = Math.max(-32768, Math.min(32767, Math.round(sample)));
  }
  return {
    sampleRate: UI_SOUND_SAMPLE_RATE,
    channels: 1,
    frames,
    data,
  };
}

const listeners = new Set<UiFeedbackListener>();
const player = createWavPlayer();
player.setVolume(1);
const playerReady = player.loadPcm(buildTapPcm());

function playTap(): void {
  if (!playerReady) return;
  // Restart from frame zero every time; a queued click must not tail the last one.
  player.stop();
  player.play();
}

listeners.add((kind) => {
  if (kind === "tap") playTap();
});

/** Decoupled UI event. Components only emit; the audio player owns playback. */
export function emitUiFeedback(kind: UiFeedbackKind): void {
  for (const listener of listeners) listener(kind);
}

/** Test/extension hook; returns an unsubscribe function. */
export function subscribeUiFeedback(listener: UiFeedbackListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pump nearest-frame PCM and drain the audio player's poll queue. */
export function pumpUiFeedback(): void {
  player.pump();
}

/** True when the host mounted audio.pcm and the click stream was created. */
export function uiSoundReady(): boolean {
  return playerReady;
}
