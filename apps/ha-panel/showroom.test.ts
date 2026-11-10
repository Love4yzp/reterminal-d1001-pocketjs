import { describe, expect, test } from "bun:test";

import {
  formatSensorValue,
  pageWindow,
  sensorStatusText,
  SHOWROOM,
  slidingWindow,
  validateShowroomConfig,
  type SensorReading,
  type ShowroomConfig,
} from "./showroom";

const reading = (value: number | string | null, status: SensorReading["status"] = "live"): SensorReading => ({
  value,
  status,
  updatedAt: status === "pending" ? null : 100,
});

describe("showroom configuration", () => {
  test("the example configuration is valid and uses stable display keys", () => {
    expect(validateShowroomConfig(SHOWROOM)).toEqual([]);
    expect(SHOWROOM.home.lights).toEqual(["desk", "shelf", "onboard", "remote"]);
    expect(SHOWROOM.lights.find(light => light.key === "remote")?.legacy).toBe(true);
    expect(SHOWROOM.lights.find(light => light.key === "remote")?.entityId).toBeUndefined();
    expect(JSON.stringify(SHOWROOM)).not.toMatch(/baseUrl|token|password/i);
  });

  test("rejects duplicate keys and dangling home or scene references", () => {
    const invalid = {
      ...SHOWROOM,
      lights: [SHOWROOM.lights[0]!, { ...SHOWROOM.lights[0]!, name: "Duplicate" }],
      home: { ...SHOWROOM.home, lights: ["desk", "missing"], sensors: ["missing"], scenes: ["missing"] },
      scenes: [{ key: "broken", name: "Invalid", kind: "local" as const, changes: { missing: { on: true } } }],
    } satisfies ShowroomConfig;
    const errors = validateShowroomConfig(invalid);
    expect(errors.some(error => error.includes("duplicate"))).toBe(true);
    expect(errors.filter(error => error.includes("unknown")).length).toBeGreaterThanOrEqual(4);
  });

  test("rejects unsupported versions and oversized home sections", () => {
    expect(validateShowroomConfig({ ...SHOWROOM, version: 2 })).toContain("unsupported version");
    expect(validateShowroomConfig({
      ...SHOWROOM,
      home: { ...SHOWROOM.home, lights: ["desk", "shelf", "onboard", "remote", "desk"] },
    })).toContain("home.lights exceeds 4 entries");
  });

  test("rejects repeated home targets and invalid initial light values", () => {
    expect(validateShowroomConfig({
      ...SHOWROOM,
      home: { ...SHOWROOM.home, lights: ["desk", "desk"] },
    })).toContain("home.lights duplicate key");
    const lights = SHOWROOM.lights.map((light, index) => index === 0
      ? { ...light, initial: { ...light.initial, brightness: 999 } }
      : light);
    expect(validateShowroomConfig({ ...SHOWROOM, lights })).toContain("lights.desk invalid initial state");
    const duplicateOnboard = SHOWROOM.lights.flatMap(light => light.key === "onboard"
      ? [light, { ...light, key: "onboard-copy" }]
      : [light]);
    expect(validateShowroomConfig({ ...SHOWROOM, lights: duplicateOnboard }))
      .toContain("multiple onboard RGB lights");
  });
});

describe("small-screen windows", () => {
  const items = ["a", "b", "c", "d", "e", "f"];

  test("clamps pages and reports the stable page count", () => {
    expect(pageWindow(items, 0, 4)).toEqual({ items: ["a", "b", "c", "d"], page: 0, pageCount: 2 });
    expect(pageWindow(items, 1, 4)).toEqual({ items: ["e", "f"], page: 1, pageCount: 2 });
    expect(pageWindow(items, 99, 4)).toEqual({ items: ["e", "f"], page: 1, pageCount: 2 });
    expect(pageWindow([], 0, 4)).toEqual({ items: [], page: 0, pageCount: 1 });
  });

  test("keeps the selected dimmer key visible in a four-chip window", () => {
    expect(slidingWindow(items, "a", 4)).toEqual(["a", "b", "c", "d"]);
    expect(slidingWindow(items, "e", 4)).toEqual(["c", "d", "e", "f"]);
    expect(slidingWindow(items, "missing", 4)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("sensor presentation", () => {
  const sensor = SHOWROOM.sensors[0]!;

  test("formats configured precision without inventing a value", () => {
    expect(formatSensorValue(sensor, reading(21.26))).toBe("21.3");
    expect(formatSensorValue(sensor, reading(null, "pending"))).toBe("--");
    expect(formatSensorValue(sensor, reading("normal"))).toBe("normal");
  });

  test("distinguishes pending, mock, offline and unavailable states", () => {
    expect(sensorStatusText(reading(null, "pending"))).toBe("待接入");
    expect(sensorStatusText(reading(20, "mock"))).toBe("示例");
    expect(sensorStatusText(reading(20, "offline"))).toBe("离线");
    expect(sensorStatusText(reading(20, "stale"))).toBe("过期");
    expect(sensorStatusText(reading(null, "unavailable"))).toBe("不可用");
    expect(sensorStatusText(reading(20))).toBe("在线");
  });
});
