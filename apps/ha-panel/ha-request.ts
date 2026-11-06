import { hsvToRgb } from "./color";
import type { LightState, SensorSample } from "./model";

export interface HaConfig {
  baseUrl: string;
  token: string;
  lightEntityId?: string;
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function normalizedBaseUrl(config: HaConfig): string {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(baseUrl))
    throw new Error("HA baseUrl must be an absolute http or https URL");
  return baseUrl;
}

function lightEntityId(config: HaConfig): string {
  if (!config.lightEntityId) throw new Error("HA lightEntityId is not configured");
  return config.lightEntityId;
}

function postRequest(config: HaConfig, path: string, value: unknown): HttpRequest {
  return {
    method: "POST",
    url: `${normalizedBaseUrl(config)}${path}`,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  };
}

export function createGetLightStateRequest(config: HaConfig): HttpRequest {
  const entityId = lightEntityId(config);
  return {
    method: "GET",
    url: `${normalizedBaseUrl(config)}/api/states/${encodeURIComponent(entityId)}`,
    headers: { Authorization: `Bearer ${config.token}` },
  };
}

export function createSetLightStateRequest(config: HaConfig, light: LightState): HttpRequest {
  const entityId = lightEntityId(config);
  if (!light.on)
    return postRequest(config, "/api/services/light/turn_off", { entity_id: entityId });
  return postRequest(config, "/api/services/light/turn_on", {
    entity_id: entityId,
    brightness: light.brightness,
    rgb_color: hsvToRgb(light.hue),
  });
}

interface SensorDescriptor {
  entityId: string;
  state: number;
  unit: string;
  deviceClass: string | null;
  friendlyName: string;
}

export function createSensorStateRequests(config: HaConfig, sample: SensorSample): HttpRequest[] {
  const sensors: SensorDescriptor[] = [
    {
      entityId: "sensor.d1001_accel_x",
      state: sample.acceleration.x,
      unit: "m/s²",
      deviceClass: null,
      friendlyName: "D1001 Acceleration X",
    },
    {
      entityId: "sensor.d1001_accel_y",
      state: sample.acceleration.y,
      unit: "m/s²",
      deviceClass: null,
      friendlyName: "D1001 Acceleration Y",
    },
    {
      entityId: "sensor.d1001_accel_z",
      state: sample.acceleration.z,
      unit: "m/s²",
      deviceClass: null,
      friendlyName: "D1001 Acceleration Z",
    },
    {
      entityId: "sensor.d1001_gyro_x",
      state: sample.angularRate.x,
      unit: "°/s",
      deviceClass: null,
      friendlyName: "D1001 Gyroscope X",
    },
    {
      entityId: "sensor.d1001_gyro_y",
      state: sample.angularRate.y,
      unit: "°/s",
      deviceClass: null,
      friendlyName: "D1001 Gyroscope Y",
    },
    {
      entityId: "sensor.d1001_gyro_z",
      state: sample.angularRate.z,
      unit: "°/s",
      deviceClass: null,
      friendlyName: "D1001 Gyroscope Z",
    },
    {
      entityId: "sensor.d1001_chip_temperature",
      state: sample.chipCelsius,
      unit: "°C",
      deviceClass: "temperature",
      friendlyName: "D1001 Chip Temperature",
    },
  ];
  return sensors.map(sensor => postRequest(config, `/api/states/${sensor.entityId}`, {
    state: sensor.state,
    attributes: {
      unit_of_measurement: sensor.unit,
      device_class: sensor.deviceClass,
      friendly_name: sensor.friendlyName,
    },
  }));
}
