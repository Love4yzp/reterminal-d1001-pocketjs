import { describe, expect, test } from "bun:test";

import { createInitialPanelState, isLightAvailable, reducePanel } from "./model";
import { navigate, nextLight } from "./navigation";
import { sceneEffect, sceneRunStatus } from "./scenes";
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

describe("multi-entity front-end seam", () => {
  test("an additional HA light snapshot is visible but read-only without a command adapter", () => {
    const initial = createInitialPanelState(config);
    const connected = reducePanel(initial, {
      type: "ha", haConfigured: true, haConnected: true, haLightConfigured: true,
    });
    expect(isLightAvailable(connected, "accent")).toBe(false);
    expect(reducePanel(connected, { type: "toggle-light", lightId: "accent" })).toBe(connected);

    const live = reducePanel(connected, {
      type: "entity-light",
      lightId: "accent",
      light: { on: true, brightness: 80, hue: 200, saturation: 40 },
    });
    expect(live.lights.accent).toEqual({ on: true, brightness: 80, hue: 200, saturation: 40 });
    expect(live.lightAvailability.accent).toBe("read-only");
    expect(isLightAvailable(live, "accent")).toBe(false);
    expect(reducePanel(live, { type: "toggle-light", lightId: "accent" })).toBe(live);
    expect(reducePanel(live, { type: "entity-light", lightId: "missing", light: live.lights.accent! })).toBe(live);
    expect(reducePanel(live, { type: "entity-light", lightId: "desk", light: live.lights.accent! })).toBe(live);
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

  test("mock readings remain explicitly marked as examples", () => {
    const next = reducePanel(createInitialPanelState(), {
      type: "sensor",
      sensorId: "humidity",
      reading: { value: 48, status: "mock", updatedAt: 100 },
    });
    expect(next.sensors.humidity?.status).toBe("mock");
    expect(reducePanel(next, { type: "sensor-tick", nowSeconds: 1000 })).toBe(next);
  });

  test("live readings expire at their configured threshold", () => {
    const live = reducePanel(createInitialPanelState(), {
      type: "sensor",
      sensorId: "temperature",
      reading: { value: 23.4, status: "live", updatedAt: 100 },
    });
    expect(reducePanel(live, { type: "sensor-tick", nowSeconds: 190 })).toBe(live);
    const stale = reducePanel(live, { type: "sensor-tick", nowSeconds: 191 });
    expect(stale.sensors.temperature).toMatchObject({ value: 23.4, status: "stale" });
    expect(reducePanel(stale, { type: "sensor-tick", nowSeconds: null })).toBe(stale);
  });

  test("HA scenes have a separate effect and local scenes report skipped members", () => {
    const withHaScene: ShowroomConfig = {
      ...SHOWROOM,
      scenes: [...SHOWROOM.scenes, { key: "welcome", name: "HA scene", kind: "ha", entityId: "scene.example_welcome" }],
    };
    const haEffect = sceneEffect(createInitialPanelState(), "welcome", withHaScene);
    expect(haEffect).toEqual({
      type: "ha", sceneId: "welcome", entityId: "scene.example_welcome",
    });
    expect(sceneRunStatus(haEffect, false)).toBe("unsupported");
    const localEffect = sceneEffect(createInitialPanelState(), "reading");
    expect(localEffect).toMatchObject({
      type: "local", skipped: ["remote"],
    });
    expect(sceneRunStatus(localEffect, true)).toBe("partial");
    expect(sceneRunStatus(localEffect, false)).toBe("failed");
    const emptyConfig: ShowroomConfig = {
      ...SHOWROOM,
      scenes: [{ key: "empty", name: "Empty", kind: "local", changes: { remote: { on: true } } }],
    };
    const emptyEffect = sceneEffect(createInitialPanelState(), "empty", emptyConfig);
    expect(emptyEffect).toMatchObject({ type: "local", appliedCount: 0, skipped: ["remote"] });
    expect(sceneRunStatus(emptyEffect, true)).toBe("failed");
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
