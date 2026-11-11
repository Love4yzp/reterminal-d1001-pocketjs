import { describe, expect, test } from "bun:test";

import { createInitialPanelState, isLightAvailable, reducePanel, type PanelState } from "./model";
import { navigate, nextLight } from "./navigation";
import { decodeSession, encodeSession } from "./session";
import { createSettings } from "./settings";
import { SHOWROOM, type ShowroomConfig } from "./showroom";

const extraLight = {
  key: "accent",
  name: "示例灯",
  chip: "示例",
  source: "ha" as const,
  entityId: "light.example_accent",
  initial: { on: false, brightness: 128, hue: 30, saturation: 50 },
};
const config: ShowroomConfig = { ...SHOWROOM, lights: [...SHOWROOM.lights, extraLight] };

function connected(config: ShowroomConfig = SHOWROOM): PanelState {
  return reducePanel(createInitialPanelState(config), {
    type: "ha", haConfigured: true, haConnected: true, haLightConfigured: true,
  });
}

describe("multi-entity front-end seam", () => {
  test("a keyed HA light becomes writable after its live snapshot", () => {
    const initial = connected(config);
    expect(isLightAvailable(initial, "accent")).toBe(false);
    expect(reducePanel(initial, { type: "toggle-light", lightId: "accent" })).toBe(initial);

    const live = reducePanel(initial, {
      type: "entity-light",
      lightId: "accent",
      light: { on: true, brightness: 80, hue: 200, saturation: 40 },
      updatedAt: 100,
    });
    expect(live.lights.accent).toEqual({ on: true, brightness: 80, hue: 200, saturation: 40 });
    expect(live.lightAvailability.accent).toBe("available");
    expect(isLightAvailable(live, "accent")).toBe(true);
    expect(reducePanel(live, { type: "toggle-light", lightId: "accent" }).lights.accent?.on).toBe(false);
    expect(reducePanel(live, { type: "entity-light", lightId: "missing", light: live.lights.accent! })).toBe(live);
    expect(reducePanel(live, { type: "entity-light", lightId: "desk", light: live.lights.accent! })).toBe(live);
  });

  test("pending and errors stay isolated by light", () => {
    let state = connected(config);
    for (const lightId of ["remote", "accent"]) {
      state = reducePanel(state, {
        type: "entity-light",
        lightId,
        light: { on: false, brightness: 128, hue: 30, saturation: 50 },
        updatedAt: 100,
      });
    }
    const pending = reducePanel(state, { type: "set-brightness", lightId: "remote", brightness: 64 });
    expect(pending.lightPending).toMatchObject({ remote: true, accent: false });
    expect(pending.lights.accent).toBe(state.lights.accent);

    const failed = reducePanel(pending, {
      type: "entity-error", domain: "light", key: "remote", availability: "unavailable", error: "unavailable",
    });
    expect(failed.lightPending).toMatchObject({ remote: false, accent: false });
    expect(failed.lightErrors).toEqual({ remote: "unavailable" });
    expect(failed.lightAvailability.accent).toBe("available");
    expect(isLightAvailable(failed, "accent")).toBe(true);
  });

  test("keyed sensor readings do not invent production values and degrade on disconnect", () => {
    const initial = createInitialPanelState();
    const withLive = reducePanel(initial, {
      type: "sensor",
      sensorId: "temperature",
      reading: { value: 23.4, status: "live", updatedAt: 100 },
    });
    expect(withLive.sensors.temperature).toEqual({ value: 23.4, status: "live", updatedAt: 100 });
    expect(reducePanel(withLive, {
      type: "sensor", sensorId: "missing", reading: { value: 1, status: "live", updatedAt: 100 },
    })).toBe(withLive);

    const offline = reducePanel(withLive, {
      type: "ha", haConfigured: true, haConnected: false, haLightConfigured: true,
    });
    expect(offline.sensors.temperature?.status).toBe("offline");
    expect(offline.sensors.temperature?.value).toBe(23.4);
  });

  test("telemetry freshness is independent and survives disconnect as offline", () => {
    const live = reducePanel(createInitialPanelState(), {
      type: "sensor",
      sensorId: "reachy-agent",
      reading: { value: "online", status: "live", updatedAt: 100 },
    });
    expect(live.sensorOrder).toEqual(["temperature", "humidity"]);
    expect(live.telemetryOrder).toEqual(["reachy-agent", "reachy-result", "arm-mode"]);
    expect(reducePanel(live, { type: "sensor-tick", nowSeconds: 190 })).toBe(live);
    const stale = reducePanel(live, { type: "sensor-tick", nowSeconds: 191 });
    expect(stale.sensors["reachy-agent"]?.status).toBe("stale");
    const offline = reducePanel(stale, {
      type: "ha", haConfigured: true, haConnected: false, haLightConfigured: true,
    });
    expect(offline.sensors["reachy-agent"]).toMatchObject({ value: "online", status: "offline", updatedAt: 100 });
  });

  test("mock readings remain explicitly marked as examples", () => {
    const next = reducePanel(createInitialPanelState(), {
      type: "sensor",
      sensorId: "humidity",
      reading: { value: 48, status: "mock", updatedAt: 100 },
    });
    expect(next.sensors.humidity?.status).toBe("mock");
    expect(reducePanel(next, { type: "sensor-tick", nowSeconds: 1000 })).toBe(next);
  });

  test("action acceptance and errors stay keyed and never become scene state", () => {
    const pending = reducePanel(createInitialPanelState(), {
      type: "action-result", actionId: "reachy-wake", status: "pending",
    });
    expect(pending.actionRuns["reachy-wake"]).toBe("pending");
    expect(pending.actionRuns["reachy-stop"]).toBe("idle");
    const accepted = reducePanel(pending, {
      type: "action-result", actionId: "reachy-wake", status: "accepted",
    });
    expect(accepted.actionRuns["reachy-wake"]).toBe("accepted");
    const failed = reducePanel(accepted, {
      type: "action-result", actionId: "reachy-stop", status: "failed", error: "HTTP status 503",
    });
    expect(failed.actionRuns["reachy-wake"]).toBe("accepted");
    expect(failed.actionErrors).toEqual({ "reachy-stop": "HTTP status 503" });
  });
});

describe("configured navigation and session", () => {
  test("uses the supplied order instead of the legacy constant", () => {
    const order = ["remote", "desk", "shelf"];
    expect(nextLight("remote", 1, order, order)).toBe("desk");
    expect(nextLight("desk", -1, order, order)).toBe("remote");
  });

  test("opens and restores a sensor detail without persisting its reading", () => {
    const route = navigate({ kind: "tab", tab: "sensors" }, { type: "open-sensor", sensorId: "temperature" });
    expect(route).toEqual({ kind: "sensor", sensorId: "temperature", from: "sensors" });
    const saved = decodeSession(encodeSession(createInitialPanelState(), route, createSettings(50)));
    expect(saved?.route).toEqual(route);
    expect(saved).not.toHaveProperty("sensors");
  });
});
