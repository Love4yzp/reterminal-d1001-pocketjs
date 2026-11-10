import { describe, expect, test } from "bun:test";

import { parseShowroomEntityMap, SHOWROOM } from "./showroom";

const valid = {
  version: 1,
  lights: { remote: "light.example_main" },
  sensors: {
    temperature: "sensor.example_temperature",
    humidity: "sensor.example_humidity",
  },
  scenes: {
    "reachy-wake": "input_button.example_wake",
    "reachy-intro-retail": "script.example_intro",
  },
  weather: "weather.example_home",
};

describe("ignored showroom entity binding", () => {
  test("parses known display keys without accepting credentials", () => {
    expect(parseShowroomEntityMap(JSON.stringify(valid))).toEqual(valid);
    expect(parseShowroomEntityMap("")).toBeUndefined();
    expect(() => parseShowroomEntityMap(JSON.stringify({ ...valid, token: "secret" })))
      .toThrow("unknown field token");
  });

  test("rejects unknown keys and wrong entity domains", () => {
    expect(() => parseShowroomEntityMap(JSON.stringify({
      ...valid,
      lights: { unknown: "light.example" },
    }))).toThrow("unknown key unknown");
    expect(() => parseShowroomEntityMap(JSON.stringify({
      ...valid,
      sensors: { temperature: "light.wrong" },
    }))).toThrow("invalid entityId");
    expect(() => parseShowroomEntityMap(JSON.stringify({
      ...valid,
      scenes: { "reachy-wake": "light.not_a_service" },
    }))).toThrow("invalid service entityId");
  });

  test("fails closed for malformed, empty and legacy-local scene mappings", () => {
    expect(() => parseShowroomEntityMap("not json")).toThrow("valid JSON");
    expect(() => parseShowroomEntityMap(JSON.stringify({ version: 1 }))).toThrow("at least one");
    expect(() => parseShowroomEntityMap(JSON.stringify({
      version: 1,
      scenes: { night: "scene.night" },
    }))).toThrow("unknown key night");
  });

  test("all public Reachy actions have bindable example service entities", () => {
    const scenes = SHOWROOM.scenes.filter(scene => scene.kind === "ha");
    expect(scenes).toHaveLength(6);
    for (const scene of scenes) expect(scene.entityId).toMatch(/^input_button\.example_reachy_/);
  });
});
