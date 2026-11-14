export type OpsProfileId = "ess" | "charger" | "lorawan";
export type OpsMode = "auto" | "boost" | "eco" | "standby";
export type Severity = "normal" | "ok" | "warn" | "critical";
export type AlarmSeverity = "critical" | "warn" | "info";

export interface OpsConfig {
  baseUrl: string;
  token: string;
  profileId: OpsProfileId;
  staleAfterSeconds: number;
  pollIntervalMs: number;
  configError?: string;
}

export interface OpsKpi {
  key: string;
  labelZh: string;
  labelEn: string;
  value: string;
  unit: string;
  tone: Severity;
}

export interface OpsAlarm {
  id: string;
  severity: AlarmSeverity;
  titleZh: string;
  titleEn: string;
  source: string;
  epoch: number;
  acked: boolean;
}

export interface OpsTelemetrySnapshot {
  siteNameZh: string;
  siteNameEn: string;
  unitId: string;
  profileId: OpsProfileId;
  revision: number;
  updatedAtEpoch: number;
  heroPercent: number;
  heroLabelZh: string;
  heroLabelEn: string;
  powerKw: number;
  targetKw: number;
  minKw: number;
  maxKw: number;
  mode: OpsMode;
  kpis: readonly OpsKpi[];
  alarms: readonly OpsAlarm[];
}

export type OpsSummary = Omit<OpsTelemetrySnapshot, "alarms">;

export type WorkerCommand =
  | { type: "poll" }
  | { type: "set-profile"; profileId: OpsProfileId }
  | { type: "setpoint"; commandId: number; mode: OpsMode; targetKw: number }
  | { type: "ack-alarm"; commandId: number; alarmId: string };

export type WorkerEvent =
  | { type: "status"; configured: boolean; connected: boolean; error: string }
  | { type: "summary"; summary: OpsSummary }
  | { type: "alarms-batch"; profileId: OpsProfileId; revision: number; reset: boolean; alarms: readonly OpsAlarm[] }
  | { type: "command-result"; commandId: number; ok: boolean; message: string; summary?: OpsSummary; alarms?: readonly OpsAlarm[] };

export function statusErrorText(error: string): string {
  return error.slice(0, 140);
}

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
