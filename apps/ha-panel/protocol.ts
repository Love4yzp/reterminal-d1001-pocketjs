import type { HaConfig, HaLightCommand } from "./ha-request";
import type { LightState, Weather } from "./model";
import type { SensorReading, ShowroomEntityMap } from "./showroom";

export interface PanelHaConfig extends HaConfig {
  selftest: boolean;
  entityMap?: ShowroomEntityMap;
  configError?: string;
}

export type WorkerCommand =
  | { type: "light"; light: LightState }
  | { type: "entity-light"; lightId: string; light: LightState; command?: HaLightCommand; seq: number }
  | { type: "action"; actionId: string; runId: number; confirmed?: boolean };

export type WorkerEvent =
  | { type: "status"; configured: boolean; connected: boolean; error: string }
  | { type: "light"; light: LightState }
  | { type: "entity-light"; lightId: string; light: LightState }
  | { type: "sensor"; sensorId: string; reading: SensorReading }
  | { type: "entity-error"; domain: "light" | "sensor"; key: string; availability: "offline" | "unavailable"; error: string }
  | { type: "action-result"; actionId: string; runId: number; status: "accepted" | "failed"; error: string }
  /** `null` when the instance has no usable weather entity. */
  | { type: "weather"; weather: Weather | null };

export function statusErrorText(error: string): string {
  return error.slice(0, 160);
}

export function encodeMessage(value: unknown, into: Uint8Array): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("value is not JSON serializable");
  const asciiJson = json.replace(/[\u0080-￿]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (asciiJson.length + 1 > into.length) throw new Error("message buffer overflow");

  for (let index = 0; index < asciiJson.length; index += 1)
    into[index] = asciiJson.charCodeAt(index);
  into[asciiJson.length] = 0;
  return asciiJson.length + 1;
}

export function decodeMessage<T>(bytes: Uint8Array): T {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  let json = "";
  for (let index = 0; index < end; index += 1)
    json += String.fromCharCode(bytes[index]!);
  return JSON.parse(json) as T;
}
