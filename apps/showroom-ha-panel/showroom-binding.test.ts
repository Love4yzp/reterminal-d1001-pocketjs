import { describe, expect, test } from "bun:test";

import {
  parseShowroomEntityMap,
  SHOWROOM,
  SHOWROOM_ENTITY_MAP_EXAMPLE,
} from "./showroom";

const valid = {
  version: 1,
  lights: { remote: "light.yeelink_cn_975205352_bslamp2_s_2_light" },
  sensors: {
    temperature: "sensor.example_temperature",
    humidity: "sensor.example_humidity",
    "reachy-agent": "sensor.example_reachy_agent",
    "reachy-result": "sensor.example_reachy_result",
    "arm-mode": "sensor.example_arm_mode",
  },
  actions: {
    "reachy-wake": "input_button.example_wake",
    "reachy-intro-retail": "input_button.example_intro",
  },
  weather: "weather.example_home",
};

describe("ignored showroom entity binding", () => {
  test("parses known display keys without accepting credentials", () => {
    expect(parseShowroomEntityMap(JSON.stringify(valid))).toEqual(valid);
    expect(parseShowroomEntityMap(JSON.stringify(SHOWROOM_ENTITY_MAP_EXAMPLE))).toEqual(SHOWROOM_ENTITY_MAP_EXAMPLE);
    expect(parseShowroomEntityMap("")).toBeUndefined();
    expect(() => parseShowroomEntityMap(JSON.stringify({ ...valid, token: "secret" })))
      .toThrow("unknown field token");
  });

  test("keeps the public JSON example in sync with the validated mock map", async () => {
    const example = JSON.parse(await Bun.file(new URL("entity-map.example.json", import.meta.url)).text());
    expect(example).toEqual(SHOWROOM_ENTITY_MAP_EXAMPLE);
    expect(parseShowroomEntityMap(JSON.stringify(example))).toEqual(SHOWROOM_ENTITY_MAP_EXAMPLE);
  });

  test("rejects unknown keys, wrong entity domains and legacy scene mappings", () => {
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
      actions: { "reachy-wake": "light.not_a_service" },
    }))).toThrow("invalid entityId");
    expect(() => parseShowroomEntityMap(JSON.stringify({
      version: 1,
      scenes: { night: "scene.night" },
    }))).toThrow("unknown field scenes");
  });

  test("fails closed for malformed and empty mappings", () => {
    expect(() => parseShowroomEntityMap("not json")).toThrow("valid JSON");
    expect(() => parseShowroomEntityMap(JSON.stringify({ version: 1 }))).toThrow("at least one");
  });

  test("provides exactly the six real Reachy action slots with bindable input_buttons", () => {
    const actions = SHOWROOM.home.actions.map(key => SHOWROOM.actions.find(action => action.key === key)!);
    expect(actions.map(action => action.name)).toEqual(["零售讲解", "空间讲解", "救灾讲解", "唤醒", "中英切换", "停止"]);
    expect(actions).toHaveLength(6);
    for (const action of actions) {
      expect(action.group).toBe("reachy");
      expect(action.entityId).toMatch(/^input_button\.example_reachy_/);
      expect(SHOWROOM_ENTITY_MAP_EXAMPLE.actions[action.key]).toBe(action.entityId);
    }
  });

  test("binds both arm modes to the shared KeyMesh script without a fake default", () => {
    const armActions = SHOWROOM.actions.filter(action => action.group === "arm");
    expect(armActions.map(action => action.name)).toEqual(["重力补偿", "动作回放"]);
    for (const action of armActions) {
      expect(action.entityId).toBeUndefined();
      expect(SHOWROOM_ENTITY_MAP_EXAMPLE.actions[action.key]).toBeUndefined();
    }
    const mapped = parseShowroomEntityMap(JSON.stringify({
      version: 1,
      actions: {
        "arm-gravity": "script.keymesh_dispatch",
        "arm-playback": "script.keymesh_dispatch",
      },
    }));
    expect(mapped?.actions["arm-gravity"]).toBe("script.keymesh_dispatch");
    expect(mapped?.actions["arm-playback"]).toBe("script.keymesh_dispatch");
    const legacy = parseShowroomEntityMap(JSON.stringify({
      version: 1,
      actions: { "arm-gravity": "input_button.example_arm_gravity" },
    }));
    expect(legacy?.actions["arm-gravity"]).toBe("input_button.example_arm_gravity");
  });
});
