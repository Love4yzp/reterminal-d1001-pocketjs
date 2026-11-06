import { describe, expect, test } from "bun:test";

import {
  createGetLightStateRequest,
  createSensorStateRequests,
  createSetLightStateRequest,
} from "./ha-request";
import type { HaConfig, HttpRequest } from "./ha-request";
import type { SensorSample } from "./model";

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
      headers: { Authorization: "Bearer test-token" },
    });
  });

  test("builds turn_on with brightness and RGB derived from hue", () => {
    const request = createSetLightStateRequest(config, { on: true, brightness: 180, hue: 120 });

    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://home-assistant.test:8123/api/services/light/turn_on");
    expect(request.headers).toEqual({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(jsonBody(request)).toEqual({
      entity_id: "light.mock lamp/1",
      brightness: 180,
      rgb_color: [0, 255, 0],
    });
  });

  test("builds turn_off with only the entity id", () => {
    const request = createSetLightStateRequest(config, { on: false, brightness: 180, hue: 120 });

    expect(request.url).toBe("http://home-assistant.test:8123/api/services/light/turn_off");
    expect(jsonBody(request)).toEqual({ entity_id: "light.mock lamp/1" });
  });

  test("rejects unsupported protocols and missing light entities", () => {
    expect(() => createGetLightStateRequest({ ...config, baseUrl: "ftp://example.test" })).toThrow("http");
    expect(() => createGetLightStateRequest({ token: "test-token", baseUrl: "http://example.test" })).toThrow("lightEntityId");
    expect(() => createSetLightStateRequest(
      { token: "test-token", baseUrl: "http://example.test" },
      { on: false, brightness: 128, hue: 0 },
    )).toThrow("lightEntityId");
  });
});

describe("HA sensor requests", () => {
  const sample: SensorSample = {
    acceleration: { x: 1.25, y: -2.5, z: 9.75 },
    angularRate: { x: 10, y: -20, z: 30 },
    chipCelsius: 43.5,
  };

  test("creates all seven authenticated numeric state posts in a stable order", () => {
    const requests = createSensorStateRequests(config, sample);

    expect(requests.map(request => request.url)).toEqual([
      "http://home-assistant.test:8123/api/states/sensor.d1001_accel_x",
      "http://home-assistant.test:8123/api/states/sensor.d1001_accel_y",
      "http://home-assistant.test:8123/api/states/sensor.d1001_accel_z",
      "http://home-assistant.test:8123/api/states/sensor.d1001_gyro_x",
      "http://home-assistant.test:8123/api/states/sensor.d1001_gyro_y",
      "http://home-assistant.test:8123/api/states/sensor.d1001_gyro_z",
      "http://home-assistant.test:8123/api/states/sensor.d1001_chip_temperature",
    ]);
    expect(requests.every(request => request.method === "POST")).toBe(true);
    expect(requests.every(request => request.headers.Authorization === "Bearer test-token")).toBe(true);
    expect(requests.every(request => request.headers["Content-Type"] === "application/json")).toBe(true);
    expect(requests.map(request => (jsonBody(request) as { state: number }).state)).toEqual([
      1.25, -2.5, 9.75, 10, -20, 30, 43.5,
    ]);
  });

  test("adds units, nullable device classes, and friendly names", () => {
    const requests = createSensorStateRequests(config, sample);
    const bodies = requests.map(request => jsonBody(request) as {
      attributes: {
        unit_of_measurement: string;
        device_class: string | null;
        friendly_name: string;
      };
    });

    expect(bodies[0]?.attributes).toEqual({
      unit_of_measurement: "m/s²",
      device_class: null,
      friendly_name: "D1001 Acceleration X",
    });
    expect(bodies[3]?.attributes).toEqual({
      unit_of_measurement: "°/s",
      device_class: null,
      friendly_name: "D1001 Gyroscope X",
    });
    expect(bodies[6]?.attributes).toEqual({
      unit_of_measurement: "°C",
      device_class: "temperature",
      friendly_name: "D1001 Chip Temperature",
    });
    for (const body of bodies) {
      expect(body.attributes.friendly_name.length).toBeGreaterThan(0);
    }
  });
});
