import { describe, expect, test } from "bun:test";

import {
  createApiProbeRequest,
  createGetEntityStateRequest,
  createGetLightStateRequest,
  createGetWeatherRequest,
  createLightCommandRequest,
  createPressButtonRequest,
  createSetLightStateRequest,
  FIRST_WEATHER_TEMPLATE,
  parseLightEntity,
  parseSensorEntity,
} from "./ha-request";
import type { HaConfig, HttpRequest } from "./ha-request";
import type { LightState } from "./model";

const config: HaConfig = {
  baseUrl: "http://home-assistant.test:8123///",
  token: "test-token",
  lightEntityId: "light.mock lamp/1",
};

function jsonBody(request: HttpRequest): unknown {
  expect(request.body).toBeDefined();
  return JSON.parse(request.body ?? "") as unknown;
}

describe("HA light requests", () => {
  test("builds an authenticated GET with an encoded entity id and normalized base URL", () => {
    const request = createGetLightStateRequest(config);

    expect(request).toEqual({
      method: "GET",
      url: "http://home-assistant.test:8123/api/states/light.mock%20lamp%2F1",
      headers: { Authorization: "Bearer test-token", Connection: "close" },
    });
  });

  test("builds turn_on with brightness_pct and RGB derived from hue and saturation", () => {
    const request = createSetLightStateRequest(config, { on: true, brightness: 180, hue: 120, saturation: 100 });

    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://home-assistant.test:8123/api/services/light/turn_on");
    expect(request.headers).toEqual({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      Connection: "close",
    });
    expect(jsonBody(request)).toEqual({
      entity_id: "light.mock lamp/1",
      brightness_pct: 71,
      rgb_color: [0, 255, 0],
    });
  });

  test("uses the HA brightness_pct service field", () => {
    const request = createSetLightStateRequest(config, { on: true, brightness: 64, hue: 0, saturation: 0 });
    expect(jsonBody(request)).toMatchObject({ brightness_pct: 25 });
    expect(jsonBody(request)).not.toHaveProperty("brightness");
  });

  test("a low saturation sends a pale color", () => {
    const request = createSetLightStateRequest(config, { on: true, brightness: 255, hue: 0, saturation: 50 });
    expect((jsonBody(request) as { rgb_color: number[] }).rgb_color).toEqual([255, 128, 128]);
  });

  test("builds turn_off with only the entity id", () => {
    const request = createSetLightStateRequest(config, { on: false, brightness: 180, hue: 120, saturation: 100 });

    expect(request.url).toBe("http://home-assistant.test:8123/api/services/light/turn_off");
    expect(jsonBody(request)).toEqual({ entity_id: "light.mock lamp/1" });
  });

  test("rejects unsupported protocols and missing light entities", () => {
    expect(() => createGetLightStateRequest({ ...config, baseUrl: "ftp://example.test" })).toThrow("http");
    expect(() => createGetLightStateRequest({ token: "test-token", baseUrl: "http://example.test" })).toThrow("lightEntityId");
    expect(() => createSetLightStateRequest(
      { token: "test-token", baseUrl: "http://example.test" },
      { on: false, brightness: 128, hue: 0, saturation: 0 },
    )).toThrow("lightEntityId");
  });
});

describe("explicit HA light commands", () => {
  test("sends a brightness_pct preset without an unrelated color mode", () => {
    const request = createLightCommandRequest(config, "light.second", { on: true, brightnessPct: 25 });
    expect(jsonBody(request)).toEqual({ entity_id: "light.second", brightness_pct: 25 });
  });

  test("sends RGB and color_temp_kelvin presets independently", () => {
    expect(jsonBody(createLightCommandRequest(config, "edidt.main", {
      on: true, rgbColor: [12, 34, 56],
    }))).toEqual({ entity_id: "edidt.main", rgb_color: [12, 34, 56] });
    expect(jsonBody(createLightCommandRequest(config, "edidt.main", {
      on: true, colorTempKelvin: 2700,
    }))).toEqual({ entity_id: "edidt.main", color_temp_kelvin: 2700 });
  });

  test("rejects conflicting or out-of-range command fields before any network call", () => {
    expect(() => createLightCommandRequest(config, "light.second", {
      on: true, rgbColor: [0, 0, 0], colorTempKelvin: 2700,
    })).toThrow("mutually exclusive");
    expect(() => createLightCommandRequest(config, "light.second", { on: true, brightnessPct: 101 }))
      .toThrow("brightnessPct");
    expect(() => createLightCommandRequest(config, "light.second", { on: true, rgbColor: [0, 0, 256] }))
      .toThrow("rgbColor");
    expect(() => createLightCommandRequest(config, "light.second", { on: true, colorTempKelvin: 500 }))
      .toThrow("colorTempKelvin");
  });
});

describe("HA light entity parsing", () => {
  const fallback: LightState = { on: false, brightness: 128, hue: 36, saturation: 70 };

  test("reads power, brightness and hs_color", () => {
    const body = JSON.stringify({ state: "on", attributes: { brightness: 200.4, hs_color: [210.6, 40.2] } });
    expect(parseLightEntity(body, fallback)).toEqual({ on: true, brightness: 200, hue: 211, saturation: 40 });
  });

  test("reads RGB and Kelvin color modes", () => {
    const body = JSON.stringify({
      state: "on",
      attributes: { brightness: 64, rgb_color: [255, 0, 0], color_temp_kelvin: 2700 },
    });
    expect(parseLightEntity(body, fallback)).toEqual({
      on: true, brightness: 64, hue: 0, saturation: 100, colorTempKelvin: 2700,
    });
  });

  test("keeps the last color when HA reports an off light without attributes", () => {
    expect(parseLightEntity(JSON.stringify({ state: "off", attributes: {} }), fallback)).toEqual(fallback);
  });

  test("rejects unavailable entities and bad JSON", () => {
    expect(parseLightEntity(JSON.stringify({ state: "unavailable" }), fallback)).toBeNull();
    expect(parseLightEntity("not json", fallback)).toBeNull();
    expect(parseLightEntity("null", fallback)).toBeNull();
  });
});

describe("HA weather requests", () => {
  test("probes the API root to learn whether HA is reachable", () => {
    expect(createApiProbeRequest(config)).toEqual({
      method: "GET",
      url: "http://home-assistant.test:8123/api/",
      headers: { Authorization: "Bearer test-token", Connection: "close" },
    });
  });

  test("reads a configured weather entity directly", () => {
    const request = createGetWeatherRequest({ ...config, weatherEntityId: "weather.forecast_home" });
    expect(request).toEqual({
      method: "GET",
      url: "http://home-assistant.test:8123/api/states/weather.forecast_home",
      headers: { Authorization: "Bearer test-token", Connection: "close" },
    });
  });

  test("otherwise renders the first weather entity through the template API", () => {
    const request = createGetWeatherRequest(config);
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://home-assistant.test:8123/api/template");
    expect(jsonBody(request)).toEqual({ template: FIRST_WEATHER_TEMPLATE });
    expect(FIRST_WEATHER_TEMPLATE).toContain("states.weather | first");
    expect(FIRST_WEATHER_TEMPLATE).toContain("null");
  });
});

describe("keyed entities and input_button services", () => {
  test("uses an explicit entity for state reads and light commands", () => {
    expect(createGetEntityStateRequest(config, "light.second").url)
      .toBe("http://home-assistant.test:8123/api/states/light.second");
    const request = createSetLightStateRequest(
      config,
      { on: false, brightness: 0, hue: 0, saturation: 0 },
      "light.second",
    );
    expect(jsonBody(request)).toEqual({ entity_id: "light.second" });
  });

  test("maps input_button to its HA press service", () => {
    const request = createPressButtonRequest(config, "input_button.wake");
    expect(request.url).toBe("http://home-assistant.test:8123/api/services/input_button/press");
    expect(jsonBody(request)).toEqual({ entity_id: "input_button.wake" });
  });

  test("rejects arbitrary service domains and malformed button ids", () => {
    expect(() => createPressButtonRequest(config, "scene.welcome")).toThrow("unsupported");
    expect(() => createPressButtonRequest(config, "input_button_missing_dot")).toThrow("entity");
  });
});

describe("HA sensor entity parsing", () => {
  test("converts numeric strings to finite numbers and preserves text states", () => {
    expect(parseSensorEntity(JSON.stringify({ state: "21.50" }))).toEqual({ status: "live", value: 21.5 });
    expect(parseSensorEntity(JSON.stringify({ state: "normal" }))).toEqual({ status: "live", value: "normal" });
  });

  test("distinguishes unavailable and malformed responses", () => {
    expect(parseSensorEntity(JSON.stringify({ state: "unavailable" }))).toEqual({ status: "unavailable", value: null });
    expect(parseSensorEntity(JSON.stringify({ state: "unknown" }))).toEqual({ status: "unavailable", value: null });
    expect(parseSensorEntity("bad json")).toBeNull();
    expect(parseSensorEntity(JSON.stringify({}))).toBeNull();
  });
});
