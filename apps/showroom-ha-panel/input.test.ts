import { describe, expect, test } from "bun:test";

import {
  focusKey,
  inputIntent,
  moveFocus,
  type FocusTarget,
} from "./input";

const targets: FocusTarget[] = [
  { kind: "light", id: "desk" },
  { kind: "arm", id: "status" },
  { kind: "sensor", id: "temperature" },
  { kind: "action", id: "reachy-stop" },
];

describe("logical keyboard and button input", () => {
  test("maps navigation, activation, details, paging and back to shared intents", () => {
    expect(inputIntent({ source: "keyboard", key: "ArrowRight" })).toEqual({ type: "focus-next" });
    expect(inputIntent({ source: "keyboard", key: "ArrowLeft" })).toEqual({ type: "focus-previous" });
    expect(inputIntent({ source: "keyboard", key: "Enter" })).toEqual({ type: "activate" });
    expect(inputIntent({ source: "keyboard", key: " " })).toEqual({ type: "activate" });
    expect(inputIntent({ source: "keyboard", key: "d" })).toEqual({ type: "details" });
    expect(inputIntent({ source: "keyboard", key: "PageDown" })).toEqual({ type: "page-next" });
    expect(inputIntent({ source: "keyboard", key: "Escape" })).toEqual({ type: "back" });
    expect(inputIntent({ source: "button", button: "next" })).toEqual({ type: "focus-next" });
    expect(inputIntent({ source: "button", button: "activate" })).toEqual({ type: "activate" });
  });

  test("ignores unknown keys and leaves the native CIRCLE system key alone", () => {
    expect(inputIntent({ source: "keyboard", key: "F24" })).toBeNull();
    expect(inputIntent({ source: "button", button: "circle" })).toBeNull();
  });
});

describe("visible focus", () => {
  test("starts from the first target and wraps in both directions", () => {
    expect(moveFocus(targets, null, 1)).toEqual(targets[0]);
    expect(moveFocus(targets, null, -1)).toEqual(targets[3]);
    expect(moveFocus(targets, targets[3], 1)).toEqual(targets[0]);
    expect(moveFocus(targets, targets[0], -1)).toEqual(targets[3]);
  });

  test("recovers from a target removed by pagination and handles empty pages", () => {
    expect(moveFocus(targets.slice(0, 2), targets[3], 1)).toEqual(targets[0]);
    expect(moveFocus([], null, 1)).toBeNull();
  });

  test("uses kind and stable display key for focus identity", () => {
    expect(focusKey(targets[0]!)).toBe("light:desk");
    expect(focusKey(targets[2]!)).toBe("sensor:temperature");
    expect(focusKey(null)).toBe("");
  });
});
