import { describe, expect, test } from "bun:test";

import { createInitialPanelState, reducePanel } from "./model";
import type { SensorSample } from "./model";

describe("createInitialPanelState", () => {
  test("creates the requested defaults", () => {
    const state = createInitialPanelState();

    expect(state.lights).toEqual({
      desk: { on: true, brightness: 180, hue: 40 },
      shelf: { on: false, brightness: 160, hue: 200 },
      onboard: { on: false, brightness: 128, hue: 210 },
      remote: { on: false, brightness: 128, hue: 0 },
    });
    expect(state.lightKinds).toEqual({
      desk: "virtual",
      shelf: "virtual",
      onboard: "onboard",
      remote: "ha",
    });
    expect(state.selected).toBe("onboard");
    expect(state.haConfigured).toBe(false);
    expect(state.haConnected).toBe(false);
    expect(state.sensors).toBeNull();
    expect(state.clockEpochSeconds).toBeNull();
    expect(state.clockSynced).toBe(false);
  });

  test("does not share mutable light state between initial states", () => {
    const first = createInitialPanelState();
    const second = createInitialPanelState();

    expect(first.lights).not.toBe(second.lights);
    expect(first.lights.desk).not.toBe(second.lights.desk);
    expect(first.lightKinds).not.toBe(second.lightKinds);
  });
});

describe("reducePanel light actions", () => {
  test("selects and toggles lights immutably", () => {
    const initial = createInitialPanelState();
    const selected = reducePanel(initial, { type: "select-light", lightId: "desk" });
    const toggled = reducePanel(selected, { type: "toggle-light", lightId: "desk" });

    expect(selected.selected).toBe("desk");
    expect(selected.lights).toBe(initial.lights);
    expect(toggled.lights.desk).toEqual({ on: false, brightness: 180, hue: 40 });
    expect(toggled.lights.shelf).toBe(initial.lights.shelf);
    expect(initial.lights.desk.on).toBe(true);
  });

  test("rounds and clamps brightness, with zero off and positive values on", () => {
    const initial = createInitialPanelState();
    const rounded = reducePanel(initial, { type: "set-brightness", lightId: "shelf", brightness: 100.6 });
    const off = reducePanel(rounded, { type: "set-brightness", lightId: "shelf", brightness: 0.2 });
    const high = reducePanel(off, { type: "set-brightness", lightId: "shelf", brightness: 300 });
    const low = reducePanel(high, { type: "set-brightness", lightId: "shelf", brightness: -10 });

    expect(rounded.lights.shelf).toEqual({ on: true, brightness: 101, hue: 200 });
    expect(off.lights.shelf).toEqual({ on: false, brightness: 0, hue: 200 });
    expect(high.lights.shelf).toEqual({ on: true, brightness: 255, hue: 200 });
    expect(low.lights.shelf).toEqual({ on: false, brightness: 0, hue: 200 });
  });

  test("rounds and wraps hue in both directions", () => {
    const initial = createInitialPanelState();
    const wrappedHigh = reducePanel(initial, { type: "set-hue", lightId: "remote", hue: 720.6 });
    const wrappedLow = reducePanel(wrappedHigh, { type: "set-hue", lightId: "remote", hue: -0.4 });

    expect(wrappedHigh.lights.remote.hue).toBe(1);
    expect(wrappedLow.lights.remote.hue).toBe(0);
    expect(reducePanel(wrappedLow, { type: "set-hue", lightId: "remote", hue: -1 }).lights.remote.hue).toBe(359);
  });
});

describe("reducePanel sensor, clock, and HA actions", () => {
  const sample: SensorSample = {
    acceleration: { x: 1, y: 2, z: 3 },
    angularRate: { x: 4, y: 5, z: 6 },
    chipCelsius: 42.5,
  };

  test("updates and clears sensor samples", () => {
    const initial = createInitialPanelState();
    const updated = reducePanel(initial, { type: "sensors", sensors: sample });
    const cleared = reducePanel(updated, { type: "sensors", sensors: null });

    expect(updated.sensors).toBe(sample);
    expect(updated.lights).toBe(initial.lights);
    expect(cleared.sensors).toBeNull();
  });

  test("updates clock fields together and supports an unsynced empty clock", () => {
    const initial = createInitialPanelState();
    const updated = reducePanel(initial, {
      type: "clock",
      clockEpochSeconds: 1_762_000_000,
      clockSynced: true,
    });
    const cleared = reducePanel(updated, {
      type: "clock",
      clockEpochSeconds: null,
      clockSynced: false,
    });

    expect(updated.clockEpochSeconds).toBe(1_762_000_000);
    expect(updated.clockSynced).toBe(true);
    expect(cleared.clockEpochSeconds).toBeNull();
    expect(cleared.clockSynced).toBe(false);
  });

  test("updates HA configuration and connection state", () => {
    const initial = createInitialPanelState();
    const configured = reducePanel(initial, { type: "ha", haConfigured: true, haConnected: false });
    const connected = reducePanel(configured, { type: "ha", haConfigured: true, haConnected: true });

    expect(configured.haConfigured).toBe(true);
    expect(configured.haConnected).toBe(false);
    expect(connected.haConfigured).toBe(true);
    expect(connected.haConnected).toBe(true);
  });
});

describe("reducePanel idempotence", () => {
  test("returns the original reference for every no-op action", () => {
    const sample: SensorSample = {
      acceleration: { x: 1, y: 2, z: 3 },
      angularRate: { x: 4, y: 5, z: 6 },
      chipCelsius: 42.5,
    };
    const initial = reducePanel(createInitialPanelState(), { type: "sensors", sensors: sample });
    const equivalentSample: SensorSample = {
      acceleration: { x: 1, y: 2, z: 3 },
      angularRate: { x: 4, y: 5, z: 6 },
      chipCelsius: 42.5,
    };

    expect(reducePanel(initial, { type: "select-light", lightId: "onboard" })).toBe(initial);
    expect(reducePanel(initial, { type: "set-brightness", lightId: "desk", brightness: 180.2 })).toBe(initial);
    expect(reducePanel(initial, { type: "set-brightness", lightId: "shelf", brightness: -1 })).not.toBe(initial);
    expect(reducePanel(initial, { type: "set-hue", lightId: "desk", hue: 400 })).toBe(initial);
    expect(reducePanel(initial, { type: "sensors", sensors: equivalentSample })).toBe(initial);
    expect(reducePanel(initial, { type: "clock", clockEpochSeconds: null, clockSynced: false })).toBe(initial);
    expect(reducePanel(initial, { type: "ha", haConfigured: false, haConnected: false })).toBe(initial);
  });
});
