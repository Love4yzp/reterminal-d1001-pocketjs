import { describe, expect, test } from "bun:test";

import {
  backlightFromX,
  createScreenOffControl,
  createSettings,
  DEFAULT_SCREEN_OFF_SECONDS,
  reduceSettings,
  SCREEN_OFF_OPTIONS,
} from "./settings";

describe("settings state", () => {
  test("starts from the device backlight and the default timeout", () => {
    expect(createSettings(80)).toEqual({ backlight: 80, screenOffSeconds: DEFAULT_SCREEN_OFF_SECONDS });
    expect(createSettings(null).backlight).toBeNull();
    expect(createSettings(0).backlight).toBe(5);
  });

  test("backlight changes are clamped and ignored without a binding", () => {
    const state = createSettings(50);
    expect(reduceSettings(state, { type: "backlight", percent: 120 }).backlight).toBe(100);
    expect(reduceSettings(state, { type: "backlight", percent: 1 }).backlight).toBe(5);
    expect(reduceSettings(state, { type: "backlight", percent: 50 })).toBe(state);
    const none = createSettings(null);
    expect(reduceSettings(none, { type: "backlight", percent: 40 })).toBe(none);
  });

  test("maps the horizontal slider to percent", () => {
    expect(backlightFromX(20, 20, 200)).toBe(5);
    expect(backlightFromX(120, 20, 200)).toBe(50);
    expect(backlightFromX(400, 20, 200)).toBe(100);
  });

  test("offers the four design timeouts and accepts only those", () => {
    expect(SCREEN_OFF_OPTIONS.map(option => option.label)).toEqual(["30 秒", "1 分钟", "5 分钟", "从不"]);
    const state = createSettings(50);
    expect(reduceSettings(state, { type: "screen-off", seconds: 0 }).screenOffSeconds).toBe(0);
    expect(reduceSettings(state, { type: "screen-off", seconds: 45 })).toBe(state);
  });

  test("screen-off control reports whether a native timer took the value", () => {
    expect(createScreenOffControl(undefined).apply(30)).toBe(false);
    const seen: number[] = [];
    const control = createScreenOffControl({ setScreenOffSeconds: seconds => { seen.push(seconds); return true; } });
    expect(control.apply(300)).toBe(true);
    expect(seen).toEqual([300]);
  });
});
