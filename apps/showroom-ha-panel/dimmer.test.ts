import { describe, expect, test } from "bun:test";

import {
  brightnessFromPercent,
  dragPercent,
  fillHeight,
  hueSaturationFromPoint,
  percentFromBrightness,
  percentFromY,
  swipeDirection,
  wheelPoint,
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

describe("color wheel", () => {
  const centerX = 200;
  const centerY = 246;
  const radius = 138;

  test("maps the angle to hue, clockwise from the top", () => {
    expect(hueSaturationFromPoint(centerX, centerY - radius, centerX, centerY, radius)).toEqual({ hue: 0, saturation: 100 });
    expect(hueSaturationFromPoint(centerX + radius, centerY, centerX, centerY, radius)).toEqual({ hue: 90, saturation: 100 });
    expect(hueSaturationFromPoint(centerX, centerY + radius, centerX, centerY, radius)).toEqual({ hue: 180, saturation: 100 });
    expect(hueSaturationFromPoint(centerX - radius, centerY, centerX, centerY, radius)).toEqual({ hue: 270, saturation: 100 });
    expect(hueSaturationFromPoint(centerX, centerY, centerX, centerY, radius)).toEqual({ hue: 0, saturation: 0 });
  });

  test("maps the radius to saturation and clamps outside the wheel", () => {
    expect(hueSaturationFromPoint(centerX, centerY - radius / 2, centerX, centerY, radius).saturation).toBe(50);
    expect(hueSaturationFromPoint(centerX, centerY - radius * 2, centerX, centerY, radius).saturation).toBe(100);
  });

  test("places a touch back at the same hue and saturation", () => {
    expect(wheelPoint(90, 100, centerX, centerY, radius)).toEqual({ x: centerX + radius, y: centerY });
    expect(wheelPoint(180, 50, centerX, centerY, radius)).toEqual({ x: centerX, y: centerY + radius / 2 });
    expect(wheelPoint(0, 0, centerX, centerY, radius)).toEqual({ x: centerX, y: centerY });
    const point = wheelPoint(210, 60, centerX, centerY, radius);
    expect(hueSaturationFromPoint(point.x, point.y, centerX, centerY, radius)).toEqual({ hue: 210, saturation: 60 });
  });
});

describe("swipes", () => {
  test("only a clear horizontal move counts as a swipe", () => {
    expect(swipeDirection(-80, 10)).toBe(1);
    expect(swipeDirection(80, 0)).toBe(-1);
    expect(swipeDirection(40, 0)).toBe(0);
    expect(swipeDirection(-80, -70)).toBe(0);
  });
});
