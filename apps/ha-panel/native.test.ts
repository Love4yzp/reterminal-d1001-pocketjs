import { afterEach, describe, expect, test } from "bun:test";

import {
  readFirmwareVersion,
  readHaConfig,
  readLandscape,
  requestLandscape,
  savePanelState,
  takePanelState,
  UNKNOWN_TEXT,
} from "./native";

const globalWithNative = globalThis as typeof globalThis & {
  d1001?: {
    firmwareVersion(): string;
    haConfig?(): unknown;
    landscape?(): boolean;
    setLandscape?(landscape: boolean): boolean;
    savePanelState?(json: string): boolean;
    takePanelState?(): string;
  };
};
const originalNative = globalWithNative.d1001;

afterEach(() => {
  if (originalNative === undefined)
    delete globalWithNative.d1001;
  else
    globalWithNative.d1001 = originalNative;
});

describe("firmware version", () => {
  test("returns the version reported by the firmware binding", () => {
    globalWithNative.d1001 = { firmwareVersion: () => "1.2.3-device" };
    expect(readFirmwareVersion()).toBe("1.2.3-device");
  });

  test("keeps empty, missing and failing bindings visibly unknown", () => {
    delete globalWithNative.d1001;
    expect(readFirmwareVersion()).toBe(UNKNOWN_TEXT);
    globalWithNative.d1001 = { firmwareVersion: () => "" };
    expect(readFirmwareVersion()).toBe(UNKNOWN_TEXT);
    globalWithNative.d1001 = { firmwareVersion: () => { throw new Error("unavailable"); } };
    expect(readFirmwareVersion()).toBe(UNKNOWN_TEXT);
  });
});

describe("orientation binding", () => {
  test("reads the native orientation and requests a return to portrait", () => {
    const requested: boolean[] = [];
    globalWithNative.d1001 = {
      firmwareVersion: () => "test",
      landscape: () => true,
      setLandscape: value => { requested.push(value); return true; },
    };
    expect(readLandscape()).toBe(true);
    expect(requestLandscape(false)).toBe(true);
    expect(requested).toEqual([false]);
  });

  test("falls back to portrait and rejection without a binding", () => {
    delete globalWithNative.d1001;
    expect(readLandscape()).toBe(false);
    expect(requestLandscape(true)).toBe(false);
  });

  test("round-trips the UI session snapshot and treats a missing slot as empty", () => {
    let saved = "";
    globalWithNative.d1001 = {
      firmwareVersion: () => "test",
      savePanelState: json => { saved = json; return true; },
      takePanelState: () => { const value = saved; saved = ""; return value; },
    };
    expect(savePanelState('{"version":1}')).toBe(true);
    expect(takePanelState()).toBe('{"version":1}');
    expect(takePanelState()).toBe("");
    delete globalWithNative.d1001;
    expect(savePanelState("{}")).toBe(false);
    expect(takePanelState()).toBe("");
  });
});

describe("HA entity-map binding", () => {
  test("reads a validated map and selects its weather entity", () => {
    globalWithNative.d1001 = {
      firmwareVersion: () => "test",
      haConfig: () => ({
        baseUrl: "http://example.test",
        token: "local-token",
        lightEntityId: "light.legacy",
        entityMapJson: JSON.stringify({
          version: 1,
          lights: { remote: "light.example_main" },
          weather: "weather.example_home",
        }),
      }),
    };
    const config = readHaConfig();
    expect(config.entityMap?.lights.remote).toBe("light.example_main");
    expect(config.weatherEntityId).toBe("weather.example_home");
    expect(config.configError).toBe("");
  });

  test("fails closed when the map is invalid", () => {
    globalWithNative.d1001 = {
      firmwareVersion: () => "test",
      haConfig: () => ({ baseUrl: "http://example.test", token: "local-token", entityMapJson: "not json" }),
    };
    const config = readHaConfig();
    expect(config.entityMap).toBeUndefined();
    expect(config.configError).toContain("valid JSON");
  });
});
