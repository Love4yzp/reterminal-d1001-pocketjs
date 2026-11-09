import { describe, expect, test } from "bun:test";

import { hsvToRgb } from "./color";
import {
  activePreset,
  brightnessFromPercent,
  COLOR_PRESETS,
  dragPercent,
  fillHeight,
  percentFromBrightness,
  percentFromY,
  swipeDirection,
} from "./dimmer";

describe("brightness mapping", () => {
  test("maps HA brightness to percent and back at the ends and middle", () => {
    expect(percentFromBrightness(0)).toBe(0);
    expect(percentFromBrightness(255)).toBe(100);
    expect(percentFromBrightness(184)).toBe(72);
    expect(brightnessFromPercent(0)).toBe(0);
    expect(brightnessFromPercent(100)).toBe(255);
    expect(brightnessFromPercent(72)).toBe(184);
  });

  test("every percent survives a round trip", () => {
    for (let percent = 0; percent <= 100; percent += 1)
      expect(percentFromBrightness(brightnessFromPercent(percent))).toBe(percent);
  });
});

describe("vertical slider", () => {
  const top = 200;
  const height = 268;

  test("maps a touch to percent from the bottom and clamps outside the track", () => {
    expect(percentFromY(top + height, top, height)).toBe(0);
    expect(percentFromY(top, top, height)).toBe(100);
    expect(percentFromY(top + height / 2, top, height)).toBe(50);
    expect(percentFromY(top - 40, top, height)).toBe(100);
    expect(percentFromY(top + height + 40, top, height)).toBe(0);
  });

  test("a drag moves relative to its start, up brightens", () => {
    expect(dragPercent(50, -height / 4, height)).toBe(75);
    expect(dragPercent(50, height / 2, height)).toBe(0);
    expect(dragPercent(90, -height, height)).toBe(100);
  });

  test("fill height follows the percent", () => {
    expect(fillHeight(0, height)).toBe(0);
    expect(fillHeight(75, height)).toBe(201);
    expect(fillHeight(100, height)).toBe(height);
  });
});

describe("swipes and presets", () => {
  test("only a clear horizontal move counts as a swipe", () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(80, 0)).toBe(-1);
    expect(swipeDirection(40, 0)).toBe(0);
    expect(swipeDirection(-80, -70)).toBe(0);
  });

  test("presets match the design swatches", () => {
    const swatches = [[0xff, 0xb7, 0x4d], [0xff, 0xf3, 0xe0], [0x4f, 0xc3, 0xf7], [0xba, 0x68, 0xc8]];
    COLOR_PRESETS.forEach((preset, index) => {
      const rgb = hsvToRgb(preset.hue, preset.saturation / 100, Math.max(...swatches[index]!) / 255);
      rgb.forEach((channel, c) => expect(Math.abs(channel - swatches[index]![c]!)).toBeLessThanOrEqual(4));
    });
    expect(activePreset(199, 68)).toBe(2);
    expect(activePreset(10, 10)).toBe(-1);
  });
});
