import { file, fsHost, write } from "@pocketjs/framework/fs";
import { createApiProbeRequest } from "./ha-request";
import { encodeMessage, type PanelHaConfig } from "./protocol";
import { parseShowroomEntityMap } from "./showroom";

export const HA_CONFIG_PATH = "ha-panel.json";
export const HA_CONFIG_RECORD_BYTES = 1024;

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
}

export function validateHaConfigMessages(config: PanelHaConfig): void {
  const { entityMap, ...base } = config;
  encodeMessage(base, new Uint8Array(HA_CONFIG_RECORD_BYTES));
  encodeMessage(entityMap ?? null, new Uint8Array(HA_CONFIG_RECORD_BYTES));
}

export function parseLocalHaConfig(source: string): PanelHaConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("HA local config must be valid JSON");
  }
  const value = object(parsed, "HA local config");
  for (const key of Object.keys(value))
    if (!["version", "baseUrl", "token", "lightEntityId", "weatherEntityId", "entityMap"].includes(key))
      throw new Error(`HA local config unknown field ${key}`);
  if (value.version !== 1) throw new Error("HA local config unsupported version");
  const baseUrl = text(value.baseUrl, "baseUrl");
  const token = text(value.token, "token");
  if (!baseUrl || !token) throw new Error("HA local config requires baseUrl and token");
  createApiProbeRequest({ baseUrl, token });
  const entityMap = value.entityMap === undefined
    ? undefined
    : parseShowroomEntityMap(JSON.stringify(value.entityMap));
  const config: PanelHaConfig = {
    baseUrl,
    token,
    lightEntityId: value.lightEntityId === undefined ? "" : text(value.lightEntityId, "lightEntityId"),
    weatherEntityId: entityMap?.weather ??
      (value.weatherEntityId === undefined ? "" : text(value.weatherEntityId, "weatherEntityId")),
    selftest: false,
    entityMap,
    configError: "",
  };
  validateHaConfigMessages(config);
  return config;
}

export function serializeLocalHaConfig(value: unknown): string {
  const source = JSON.stringify(value);
  if (!source) throw new Error("HA local config must be an object");
  const config = parseLocalHaConfig(source);
  return `${JSON.stringify({
    version: 1,
    baseUrl: config.baseUrl,
    token: config.token,
    lightEntityId: config.lightEntityId ?? "",
    weatherEntityId: config.weatherEntityId ?? "",
    entityMap: config.entityMap,
  }, null, 2)}\n`;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 80);
}

export function readLocalHaConfig(): PanelHaConfig | undefined {
  if (!fsHost()) return undefined;
  try {
    const saved = file(HA_CONFIG_PATH);
    if (!saved.exists()) return undefined;
    return parseLocalHaConfig(saved.text());
  } catch (error) {
    return { baseUrl: "", token: "", selftest: false, configError: errorText(error) };
  }
}

export function writeLocalHaConfig(source: string): number {
  return write(HA_CONFIG_PATH, serializeLocalHaConfig(JSON.parse(source)));
}
