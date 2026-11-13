import { afterEach, describe, expect, test } from "bun:test";

import {
  canSwitchNetwork,
  formatRssi,
  NOT_CONNECTED_TEXT,
  readFirmwareVersion,
  readHaConfig,
  readLandscape,
  readNetwork,
  requestLandscape,
  requestNextPreset,
  savePanelState,
  takePanelState,
  UNKNOWN_TEXT,
} from "./native";

const globalWithNative = globalThis as typeof globalThis & {
  d1001?: {
    firmwareVersion(): string;
    landscape?(): boolean;
    setLandscape?(landscape: boolean): boolean;
    savePanelState?(json: string): boolean;
    takePanelState?(): string;
  };
};
const originalNative = globalWithNative.d1001;
const globalWithWifi = globalThis as typeof globalThis & {
  wifi?: {
    status(): string;
    setEnabled(): boolean;
    connect(): boolean;
    nextPreset?(): boolean;
  };
};
const originalWifi = globalWithWifi.wifi;

afterEach(() => {
  if (originalNative === undefined)
    delete globalWithNative.d1001;
  else
    globalWithNative.d1001 = originalNative;
  if (originalWifi === undefined)
    delete globalWithWifi.wifi;
  else
    globalWithWifi.wifi = originalWifi;
});

function installWifi(status: Record<string, unknown>, nextPreset?: () => boolean) {
  globalWithWifi.wifi = {
    status: () => JSON.stringify(status),
    setEnabled: () => true,
    connect: () => false,
    ...(nextPreset ? { nextPreset } : {}),
  };
}

describe("firmware version", () => {
  test("returns the version reported by the firmware binding", () => {
    globalWithNative.d1001 = { firmwareVersion: () => "1.2.3-device" };
    expect(readFirmwareVersion()).toBe("1.2.3-device");
  });

  test("keeps empty, missing and failing bindings visibly unknown", () => {
    delete globalWithNative.d1001;
    expect(readFirmwareVersion()).toBe(UNKNOWN_TEXT);
    expect(readFirmwareVersion("en")).toBe("Unknown");
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

describe("station network status", () => {
  test("reads the current SSID, address and RSSI", () => {
    installWifi({ state: "connected", ssid: "Seeed-Demo", strength: 3, rssi: -52, address: "10.0.0.5" });
    expect(readNetwork()).toEqual({
      connected: true,
      ssid: "Seeed-Demo",
      address: "10.0.0.5",
      strength: 3,
      rssi: -52,
    });
    expect(formatRssi(-52)).toBe("-52 dBm");
  });

  test("keeps a missing RSSI visible as unknown", () => {
    installWifi({ state: "connected", ssid: "SEEED-COM", strength: 2, address: "10.0.0.6" });
    expect(readNetwork().rssi).toBeNull();
    expect(formatRssi(null)).toBe(UNKNOWN_TEXT);
    expect(formatRssi(null, "en")).toBe("Unknown");
    installWifi({ state: "idle", ssid: "", strength: 0, address: "" });
    expect(readNetwork()).toMatchObject({
      connected: false,
      ssid: NOT_CONNECTED_TEXT,
      address: NOT_CONNECTED_TEXT,
      rssi: null,
    });
    expect(readNetwork("en")).toMatchObject({
      connected: false,
      ssid: "Not connected",
      address: "Not connected",
      rssi: null,
    });
  });

  test("requests the next preset only when the firmware binds it", () => {
    let requested = 0;
    installWifi({ state: "connected", ssid: "Seeed-Demo", strength: 3, address: "10.0.0.5" }, () => {
      requested += 1;
      return true;
    });
    expect(canSwitchNetwork()).toBe(true);
    expect(requestNextPreset()).toBe(true);
    expect(requested).toBe(1);

    installWifi({ state: "connected", ssid: "Seeed-Demo", strength: 3, address: "10.0.0.5" });
    expect(canSwitchNetwork()).toBe(false);
    expect(requestNextPreset()).toBe(false);

    installWifi({ state: "connected", ssid: "Seeed-Demo", strength: 3, address: "10.0.0.5" }, () => {
      throw new Error("radio unavailable");
    });
    expect(requestNextPreset()).toBe(false);
  });
});

describe("HA configuration source", () => {
  test("does not fall back to firmware Kconfig when data.fs is unavailable", () => {
    globalWithNative.d1001 = { firmwareVersion: () => "test" };
    const config = readHaConfig();
    expect(config.baseUrl).toBe("");
    expect(config.token).toBe("");
    expect(config.entityMap).toBeUndefined();
  });
});
