import { describe, expect, test } from "bun:test";

import {
  availableLights,
  changedLights,
  createInitialPanelState,
  isLightAvailable,
  reducePanel,
  type PanelState,
} from "./model";

function connected(): PanelState {
  return reducePanel(createInitialPanelState(), {
    type: "ha", haConfigured: true, haConnected: true, haLightConfigured: true,
  });
}

describe("createInitialPanelState", () => {
  test("starts with HA offline, no weather and no clock", () => {
    const state = createInitialPanelState();
    expect(state.lightKinds).toEqual({ desk: "virtual", shelf: "virtual", onboard: "onboard", remote: "ha" });
    expect(state.haConfigured).toBe(false);
    expect(state.haConnected).toBe(false);
    expect(state.haLightConfigured).toBe(false);
    expect(state.weather).toBeNull();
    expect(state.clockEpochSeconds).toBeNull();
    expect(state).not.toHaveProperty("sensors");
  });

  test("keeps the onboard RGB as a light", () => {
    expect(createInitialPanelState().lights.onboard).toEqual({ on: false, brightness: 128, hue: 199, saturation: 68 });
  });
});

describe("light availability", () => {
  test("the HA light needs a connection and a configured entity", () => {
    const offline = createInitialPanelState();
    expect(isLightAvailable(offline, "remote")).toBe(false);
    expect(availableLights(offline)).toEqual(["desk", "shelf", "onboard"]);
    const noEntity = reducePanel(offline, { type: "ha", haConfigured: true, haConnected: true, haLightConfigured: false });
    expect(isLightAvailable(noEntity, "remote")).toBe(false);
    expect(availableLights(connected())).toEqual(["desk", "shelf", "onboard", "remote"]);
  });

  test("user actions on an unavailable light are no-ops", () => {
    const state = createInitialPanelState();
    expect(reducePanel(state, { type: "toggle-light", lightId: "remote" })).toBe(state);
    expect(reducePanel(state, { type: "set-brightness", lightId: "remote", brightness: 40 })).toBe(state);
  });

  test("HA state still lands while the light is unavailable", () => {
    const next = reducePanel(createInitialPanelState(), {
      type: "remote-light", light: { on: true, brightness: 200, hue: 120, saturation: 50 },
    });
    expect(next.lights.remote).toEqual({ on: true, brightness: 200, hue: 120, saturation: 50 });
  });
});

describe("light actions", () => {
  test("toggle flips power and keeps the brightness", () => {
    const state = createInitialPanelState();
    const next = reducePanel(state, { type: "toggle-light", lightId: "shelf" });
    expect(next.lights.shelf).toEqual({ ...state.lights.shelf, on: true });
    expect(next.lights.desk).toBe(state.lights.desk);
  });

  test("brightness 0 turns a light off and switching it on restores the default", () => {
    const off = reducePanel(createInitialPanelState(), { type: "set-brightness", lightId: "desk", brightness: 0 });
    expect(off.lights.desk).toMatchObject({ on: false, brightness: 0 });
    const on = reducePanel(off, { type: "toggle-light", lightId: "desk" });
    expect(on.lights.desk).toMatchObject({ on: true, brightness: 128 });
  });

  test("brightness above 0 turns a light on and is clamped", () => {
    const next = reducePanel(createInitialPanelState(), { type: "set-brightness", lightId: "shelf", brightness: 400.4 });
    expect(next.lights.shelf).toMatchObject({ on: true, brightness: 255 });
  });

  test("set-color wraps hue and clamps saturation without touching power", () => {
    const next = reducePanel(createInitialPanelState(), { type: "set-color", lightId: "shelf", hue: -30, saturation: 140 });
    expect(next.lights.shelf).toMatchObject({ on: false, hue: 330, saturation: 100 });
  });

  test("unchanged values return the same state", () => {
    const state = createInitialPanelState();
    const desk = state.lights.desk;
    expect(reducePanel(state, { type: "set-brightness", lightId: "desk", brightness: desk.brightness })).toBe(state);
    expect(reducePanel(state, { type: "set-color", lightId: "desk", hue: desk.hue, saturation: desk.saturation })).toBe(state);
    expect(reducePanel(state, { type: "set-lights", changes: {} })).toBe(state);
  });

  test("set-lights changes several lights in one step", () => {
    const next = reducePanel(connected(), { type: "set-lights", changes: { desk: { on: false }, remote: { on: true, brightness: 51 } } });
    expect(next.lights.desk.on).toBe(false);
    expect(next.lights.remote).toMatchObject({ on: true, brightness: 51 });
    expect(changedLights(connected(), next)).toEqual(["desk", "remote"]);
  });
});

describe("HA and weather", () => {
  const weather = { entityId: "weather.home", condition: "cloudy", temperature: 18, unit: "°C" };

  test("stores live weather and drops it when HA disconnects", () => {
    const withWeather = reducePanel(connected(), { type: "weather", weather });
    expect(withWeather.weather).toEqual(weather);
    expect(reducePanel(withWeather, { type: "weather", weather: { ...weather } })).toBe(withWeather);
    const offline = reducePanel(withWeather, { type: "ha", haConfigured: true, haConnected: false, haLightConfigured: true });
    expect(offline.weather).toBeNull();
  });

  test("ignores repeated status and clock updates", () => {
    const state = connected();
    expect(reducePanel(state, { type: "ha", haConfigured: true, haConnected: true, haLightConfigured: true })).toBe(state);
    const clocked = reducePanel(state, { type: "clock", clockEpochSeconds: 10, clockSynced: true });
    expect(reducePanel(clocked, { type: "clock", clockEpochSeconds: 10, clockSynced: true })).toBe(clocked);
  });
});
