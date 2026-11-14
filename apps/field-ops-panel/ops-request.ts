import type { OpsConfig, OpsMode, OpsProfileId, OpsTelemetrySnapshot } from "./protocol";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

function authHeaders(token: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("baseUrl must start with http:// or https://");
  return trimmed;
}

export function buildSnapshotRequest(config: Pick<OpsConfig, "baseUrl" | "token">, profileId: OpsProfileId): HttpRequest {
  const base = normalizeBaseUrl(config.baseUrl);
  return {
    url: `${base}/api/v1/ops/snapshot?profile=${encodeURIComponent(profileId)}`,
    method: "GET",
    headers: authHeaders(config.token),
  };
}

export function buildSetpointRequest(
  config: Pick<OpsConfig, "baseUrl" | "token">,
  profileId: OpsProfileId,
  mode: OpsMode,
  targetKw: number,
  commandId: number,
): HttpRequest {
  const base = normalizeBaseUrl(config.baseUrl);
  return {
    url: `${base}/api/v1/ops/command`,
    method: "POST",
    headers: authHeaders(config.token, true),
    body: JSON.stringify({ profileId, mode, targetKw, commandId }),
  };
}

export function buildAckAlarmRequest(
  config: Pick<OpsConfig, "baseUrl" | "token">,
  profileId: OpsProfileId,
  alarmId: string,
): HttpRequest {
  const base = normalizeBaseUrl(config.baseUrl);
  return {
    url: `${base}/api/v1/ops/alarms/${encodeURIComponent(alarmId)}/ack?profile=${encodeURIComponent(profileId)}`,
    method: "POST",
    headers: authHeaders(config.token, true),
    body: JSON.stringify({ acked: true }),
  };
}

export function parseSnapshotPayload(body: string): OpsTelemetrySnapshot {
  const parsed = JSON.parse(body) as Partial<OpsTelemetrySnapshot>;
  if (!parsed || typeof parsed !== "object") throw new Error("invalid snapshot payload");
  if (typeof parsed.unitId !== "string" || typeof parsed.heroPercent !== "number" || !Array.isArray(parsed.kpis)) {
    throw new Error("snapshot missing required telemetry fields");
  }
  return {
    siteNameZh: typeof parsed.siteNameZh === "string" ? parsed.siteNameZh : parsed.unitId,
    siteNameEn: typeof parsed.siteNameEn === "string" ? parsed.siteNameEn : parsed.unitId,
    unitId: parsed.unitId,
    profileId: parsed.profileId ?? "ess",
    revision: typeof parsed.revision === "number" ? parsed.revision : 1,
    updatedAtEpoch: typeof parsed.updatedAtEpoch === "number" ? parsed.updatedAtEpoch : 0,
    heroPercent: Math.max(0, Math.min(100, Math.round(parsed.heroPercent))),
    heroLabelZh: typeof parsed.heroLabelZh === "string" ? parsed.heroLabelZh : "状态",
    heroLabelEn: typeof parsed.heroLabelEn === "string" ? parsed.heroLabelEn : "STATE",
    powerKw: typeof parsed.powerKw === "number" ? parsed.powerKw : 0,
    targetKw: typeof parsed.targetKw === "number" ? parsed.targetKw : 30,
    minKw: typeof parsed.minKw === "number" ? parsed.minKw : 5,
    maxKw: typeof parsed.maxKw === "number" ? parsed.maxKw : 60,
    mode: parsed.mode ?? "auto",
    kpis: parsed.kpis.slice(0, 4),
    alarms: Array.isArray(parsed.alarms) ? parsed.alarms.slice(0, 16) : [],
  };
}

export interface CommandResponsePayload {
  ok: boolean;
  message: string;
  snapshot?: OpsTelemetrySnapshot;
}

export function parseCommandPayload(body: string): CommandResponsePayload {
  const parsed = JSON.parse(body) as {
    ok?: boolean;
    message?: string;
    snapshot?: unknown;
  };
  return {
    ok: parsed.ok !== false,
    message: typeof parsed.message === "string" ? parsed.message : "Confirmed",
    snapshot: parsed.snapshot ? parseSnapshotPayload(JSON.stringify(parsed.snapshot)) : undefined,
  };
}
