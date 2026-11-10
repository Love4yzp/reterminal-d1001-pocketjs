import { hsvToRgb } from "./color";
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

export function createGetEntityStateRequest(config: HaConfig, entityId: string): HttpRequest {
  if (!/^[a-z_]+\..+$/i.test(entityId)) throw new Error("invalid HA entity_id");
  return {
    method: "GET",
    url: `${normalizedBaseUrl(config)}/api/states/${encodeURIComponent(entityId)}`,
    headers: { Authorization: `Bearer ${config.token}` },
  };
}

/** GET /api/ answers {"message":"API running."} for any valid token. */
export function createApiProbeRequest(config: HaConfig): HttpRequest {
  return {
    method: "GET",
    url: `${normalizedBaseUrl(config)}/api/`,
    headers: { Authorization: `Bearer ${config.token}` },
  };
}

export function createGetLightStateRequest(config: HaConfig): HttpRequest {
  return createGetEntityStateRequest(config, lightEntityId(config));
}

export function createSetLightStateRequest(
  config: HaConfig,
  light: LightState,
  entityId = lightEntityId(config),
): HttpRequest {
  if (!/^[a-z_]+\..+$/i.test(entityId)) throw new Error("invalid HA entity_id");
  if (!light.on)
    return postRequest(config, "/api/services/light/turn_off", { entity_id: entityId });
  return postRequest(config, "/api/services/light/turn_on", {
    entity_id: entityId,
    brightness: light.brightness,
    rgb_color: hsvToRgb(light.hue, light.saturation / 100),
  });
}

export function createActivateEntityRequest(config: HaConfig, entityId: string): HttpRequest {
  const match = /^(scene|script|input_button)\.([a-z0-9_]+)$/i.exec(entityId);
  if (!match) throw new Error("unsupported or invalid service entity_id");
  const service = match[1] === "input_button" ? "press" : "turn_on";
  return postRequest(config, `/api/services/${match[1]}/${service}`, { entity_id: entityId });
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

/** Reads an HA light entity body; brightness and hs_color fall back when the light is off. */
export function parseLightEntity(body: string, fallback: LightState): LightState | null {
  let entity: { state?: unknown; attributes?: { brightness?: unknown; hs_color?: unknown } };
  try {
    entity = JSON.parse(body) as typeof entity;
  } catch {
    return null;
  }
  if (typeof entity !== "object" || entity === null) return null;
  if (entity.state !== "on" && entity.state !== "off") return null;
  const attributes = entity.attributes ?? {};
  const hs = Array.isArray(attributes.hs_color) ? attributes.hs_color : [];
  const number = (value: unknown, otherwise: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : otherwise;
  return {
    on: entity.state === "on",
    brightness: Math.round(number(attributes.brightness, fallback.brightness)),
    hue: Math.round(number(hs[0], fallback.hue)),
    saturation: Math.round(number(hs[1], fallback.saturation)),
  };
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
