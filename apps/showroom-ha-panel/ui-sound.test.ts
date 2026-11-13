import { describe, expect, test } from "bun:test";

import {
  buildTapPcm,
  emitUiFeedback,
  pumpUiFeedback,
  subscribeUiFeedback,
  uiSoundReady,
  UI_SOUND_CLICK_FRAMES,
  UI_SOUND_LEAD_FRAMES,
  UI_SOUND_SAMPLE_RATE,
} from "./ui-sound";

describe("UI feedback sound", () => {
  test("builds a 22050 Hz mono click with a 12 ms silent lead", () => {
    const pcm = buildTapPcm();
    expect(pcm.sampleRate).toBe(UI_SOUND_SAMPLE_RATE);
    expect(pcm.channels).toBe(1);
    expect(pcm.frames).toBe(UI_SOUND_LEAD_FRAMES + UI_SOUND_CLICK_FRAMES);
    expect(pcm.data).toHaveLength(pcm.frames);
    for (let i = 0; i < UI_SOUND_LEAD_FRAMES; i += 1) expect(pcm.data[i]).toBe(0);

    const click = pcm.data.subarray(UI_SOUND_LEAD_FRAMES);
    expect(click.some(sample => sample !== 0)).toBe(true);
    const peak = Math.max(...click.map(sample => Math.abs(sample)));
    expect(peak).toBeGreaterThan(0.2 * 32767);
    expect(peak).toBeLessThanOrEqual(Math.round(0.6 * 32767));
    expect(Math.abs(click[click.length - 1]!)).toBeLessThan(0.02 * 32767);
  });

  test("emits decoupled tap events and unsubscribes cleanly", () => {
    let received = 0;
    const unsubscribe = subscribeUiFeedback(kind => {
      if (kind === "tap") received += 1;
    });
    emitUiFeedback("tap");
    emitUiFeedback("tap");
    expect(received).toBe(2);
    unsubscribe();
    emitUiFeedback("tap");
    expect(received).toBe(2);
    expect(() => pumpUiFeedback()).not.toThrow();
  });

  test("stays silent when the preview host has no audio module", () => {
    expect(uiSoundReady()).toBe(false);
  });
});
