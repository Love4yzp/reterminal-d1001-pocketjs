import { describe, expect, test } from "bun:test";

import { applyBrightness, argb, hsvToRgb } from "./color";

describe("hsvToRgb", () => {
  test("converts the three primary hue sectors", () => {
    expect(hsvToRgb(0)).toEqual([255, 0, 0]);
    expect(hsvToRgb(120)).toEqual([0, 255, 0]);
    expect(hsvToRgb(240)).toEqual([0, 0, 255]);
  });

  test("wraps hue, including negative and non-integer inputs", () => {
    expect(hsvToRgb(360)).toEqual([255, 0, 0]);
    expect(hsvToRgb(-120)).toEqual([0, 0, 255]);
    expect(hsvToRgb(480)).toEqual([0, 255, 0]);
    expect(hsvToRgb(30, 1, 0.5)).toEqual([128, 64, 0]);
  });

  test("clamps saturation and value and rounds channels", () => {
    expect(hsvToRgb(0, 0.5, 0.5)).toEqual([128, 64, 64]);
    expect(hsvToRgb(0, 2, 2)).toEqual([255, 0, 0]);
    expect(hsvToRgb(120, -1, 0.5)).toEqual([128, 128, 128]);
    expect(hsvToRgb(240, 1, -1)).toEqual([0, 0, 0]);
  });
});

describe("applyBrightness", () => {
  test("scales channels with rounded 8-bit brightness", () => {
    expect(applyBrightness([255, 128, 64], 0)).toEqual([0, 0, 0]);
    expect(applyBrightness([255, 128, 64], 128)).toEqual([128, 64, 32]);
  });

  test("clamps brightness to the 0..255 range", () => {
    expect(applyBrightness([10, 20, 30], -1)).toEqual([0, 0, 0]);
    expect(applyBrightness([10, 20, 30], 256)).toEqual([10, 20, 30]);
    expect(applyBrightness([255, 128, 64], 127.5)).toEqual([128, 64, 32]);
  });
});

describe("argb", () => {
  test("returns an unsigned 0xffRRGGBB number", () => {
    expect(argb([0x12, 0x34, 0x56])).toBe(0xff123456);
    expect(argb([255, 0, 0])).toBe(0xffff0000);
    expect(argb([0, 0, 0])).toBe(0xff000000);
    expect(argb([255, 255, 255])).toBe(0xffffffff);
  });
});
