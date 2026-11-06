import type { HaConfig } from "./ha-request";
import type { LightState, SensorSample } from "./model";

export interface PanelHaConfig extends HaConfig {
  selftest: boolean;
}

export type WorkerCommand =
  | { type: "light"; light: LightState }
  | { type: "sensors"; sample: SensorSample };

export type WorkerEvent =
  | { type: "status"; configured: boolean; connected: boolean; error: string }
  | { type: "light"; light: LightState };

export function encodeMessage(value: unknown, into: Uint8Array): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("value is not JSON serializable");
  const asciiJson = json.replace(/[\u0080-\uffff]/g, character =>
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
