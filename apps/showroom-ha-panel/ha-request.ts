import { hsvToRgb, rgbToHsv, type Rgb } from "./color";
import type { LightState } from "./model";

export interface HaConfig {
  baseUrl: string;
  token: string;
  lightEntityId?: string;
  /** Optional; without it the first weather.* entity on the instance is used. */
  weatherEntityId?: string;
}

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HaLightCommand {
  on: boolean;
  brightnessPct?: number;
  rgbColor?: Rgb;
  colorTempKelvin?: number;
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
      Connection: "close",
    },
    body: JSON.stringify(value),
  };
}

export function createGetEntityStateRequest(config: HaConfig, entityId: string): HttpRequest {
  if (!/^[a-z_]+\..+$/i.test(entityId)) throw new Error("invalid HA entity_id");
  return {
    method: "GET",
    url: `${normalizedBaseUrl(config)}/api/states/${encodeURIComponent(entityId)}`,
    headers: { Authorization: `Bearer ${config.token}`, Connection: "close" },
  };
}

/** GET /api/ answers {"message":"API running."} for any valid token. */
export function createApiProbeRequest(config: HaConfig): HttpRequest {
  return {
    method: "GET",
    url: `${normalizedBaseUrl(config)}/api/`,
    headers: { Authorization: `Bearer ${config.token}`, Connection: "close" },
  };
}

export function createGetLightStateRequest(config: HaConfig): HttpRequest {
  return createGetEntityStateRequest(config, lightEntityId(config));
}

export function createLightCommandRequest(
  config: HaConfig,
  entityId: string,
  command: HaLightCommand,
): HttpRequest {
  if (!/^[a-z_]+\..+$/i.test(entityId)) throw new Error("invalid HA entity_id");
  if (!command.on)
    return postRequest(config, "/api/services/light/turn_off", { entity_id: entityId });
  if (command.rgbColor && command.colorTempKelvin !== undefined)
    throw new Error("rgbColor and colorTempKelvin are mutually exclusive");

  const body: Record<string, unknown> = { entity_id: entityId };
  if (command.brightnessPct !== undefined) {
    if (!Number.isFinite(command.brightnessPct) || command.brightnessPct < 0 || command.brightnessPct > 100)
      throw new Error("brightnessPct must be from 0 to 100");
    body.brightness_pct = Math.round(command.brightnessPct);
  }
  if (command.rgbColor) {
    if (command.rgbColor.length !== 3 ||
        !command.rgbColor.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255))
      throw new Error("rgbColor must contain three integers from 0 to 255");
    body.rgb_color = [...command.rgbColor];
  }
  if (command.colorTempKelvin !== undefined) {
    if (!Number.isFinite(command.colorTempKelvin) || command.colorTempKelvin < 1_000 || command.colorTempKelvin > 10_000)
      throw new Error("colorTempKelvin must be from 1000 to 10000");
    body.color_temp_kelvin = Math.round(command.colorTempKelvin);
  }
  return postRequest(config, "/api/services/light/turn_on", body);
}

export function createSetLightStateRequest(
  config: HaConfig,
  light: LightState,
  entityId = lightEntityId(config),
): HttpRequest {
  return createLightCommandRequest(config, entityId, {
    on: light.on,
    brightnessPct: Math.round(light.brightness / 255 * 100),
    ...(light.colorTempKelvin !== undefined
      ? { colorTempKelvin: light.colorTempKelvin }
      : { rgbColor: hsvToRgb(light.hue, light.saturation / 100) }),
  });
}

export function createPressButtonRequest(config: HaConfig, entityId: string): HttpRequest {
  if (!/^input_button\.[a-z0-9_]+$/i.test(entityId))
    throw new Error("unsupported or invalid input_button entity_id");
  return postRequest(config, "/api/services/input_button/press", { entity_id: entityId });
}

export function createArmScriptRequest(config: HaConfig, entityId: string, actionId: string): HttpRequest {
  if (entityId !== "script.keymesh_dispatch")
    throw new Error("arm actions require script.keymesh_dispatch");
  const command = {
    entity_id: entityId,
    host: "hall-win-3bbkv8f",
    confirm: true,
  };
  if (actionId === "arm-gravity")
    return postRequest(config, "/api/services/script/turn_on", { ...command, task: "arm-gravity-start" });
  if (actionId === "arm-playback")
    return postRequest(config, "/api/services/script/turn_on", {
      ...command,
      task: "arm-play",
      action: "act_db914a65db",
    });
  throw new Error("unsupported arm action");
}

/**
 * Renders the first weather entity in the same JSON shape as /api/states/<id>,
 * or `null` when the instance has none. /api/template needs an admin token.
 */
export const FIRST_WEATHER_TEMPLATE =
  "{% set w = states.weather | first %}{% if w %}" +
  "{{ {'entity_id': w.entity_id, 'state': w.state, 'attributes': " +
  "{'temperature': w.attributes.temperature, 'temperature_unit': w.attributes.temperature_unit}} | tojson }}" +
  "{% else %}null{% endif %}";

export function createGetWeatherRequest(config: HaConfig): HttpRequest {
  if (config.weatherEntityId) return createGetEntityStateRequest(config, config.weatherEntityId);
  return postRequest(config, "/api/template", { template: FIRST_WEATHER_TEMPLATE });
}

/** Reads an HA light entity body; brightness and color fall back when the light is off. */
export function parseLightEntity(body: string, fallback: LightState): LightState | null {
  let entity: {
    state?: unknown;
    attributes?: {
      brightness?: unknown;
      hs_color?: unknown;
      rgb_color?: unknown;
      color_temp_kelvin?: unknown;
    };
  };
  try {
    entity = JSON.parse(body) as typeof entity;
  } catch {
    return null;
  }
  if (typeof entity !== "object" || entity === null) return null;
  if (entity.state !== "on" && entity.state !== "off") return null;
  const attributes = entity.attributes ?? {};
  const hs = Array.isArray(attributes.hs_color) ? attributes.hs_color : [];
  const rgb: Rgb | null = Array.isArray(attributes.rgb_color) && attributes.rgb_color.length === 3 &&
    attributes.rgb_color.every(channel => typeof channel === "number" && Number.isFinite(channel))
    ? attributes.rgb_color as unknown as Rgb
    : null;
  const rgbHs = rgb ? rgbToHsv(rgb) : null;
  const number = (value: unknown, otherwise: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : otherwise;
  const light: LightState = {
    on: entity.state === "on",
    brightness: Math.round(number(attributes.brightness, fallback.brightness)),
    hue: Math.round(number(hs[0], rgbHs?.[0] ?? fallback.hue)),
    saturation: Math.round(number(hs[1], rgbHs?.[1] ?? fallback.saturation)),
  };
  if (typeof attributes.color_temp_kelvin === "number" && Number.isFinite(attributes.color_temp_kelvin))
    light.colorTempKelvin = Math.round(attributes.color_temp_kelvin);
  return light;
}

export type SensorEntityResult =
  | { status: "live"; value: number | string }
  | { status: "unavailable"; value: null }
  | null;

export function parseSensorEntity(body: string): SensorEntityResult {
  let entity: { state?: unknown };
  try {
    entity = JSON.parse(body) as typeof entity;
  } catch {
    return null;
  }
  if (typeof entity !== "object" || entity === null) return null;
  if (entity.state === "unavailable" || entity.state === "unknown")
    return { status: "unavailable", value: null };
  if (typeof entity.state === "number")
    return Number.isFinite(entity.state) ? { status: "live", value: entity.state } : null;
  if (typeof entity.state !== "string" || entity.state.length === 0) return null;
  const numeric = Number(entity.state);
  return Number.isFinite(numeric)
    ? { status: "live", value: numeric }
    : { status: "live", value: entity.state };
}
