import { pick, type Language } from "./i18n";
import type {
  OpsAlarm,
  OpsMode,
  OpsProfileId,
  OpsTelemetrySnapshot,
} from "./protocol";
import type { ThemeId } from "./theme";

export type Freshness = "none" | "live" | "stale" | "offline";

export interface PendingCommand {
  commandId: number;
  labelZh: string;
  labelEn: string;
  startedFrame: number;
}

export interface CommandReceipt {
  ok: boolean;
  message: string;
  expiresFrame: number;
}

export interface OpsState {
  configured: boolean;
  connected: boolean;
  configError: string;
  error: string;
  profileId: OpsProfileId;
  staleAfterSeconds: number;
  snapshot: OpsTelemetrySnapshot | null;
  lastReceivedEpoch: number | null;
  clockEpochSeconds: number | null;
  draftMode: OpsMode;
  draftTargetKw: number;
  dirtyDraft: boolean;
  pendingCommand: PendingCommand | null;
  receipt: CommandReceipt | null;
  themeId: ThemeId;
  language: Language;
  muted: boolean;
  nextCommandId: number;
}

export const MODES: readonly OpsMode[] = ["auto", "boost", "eco", "standby"];
export const PROFILES: readonly OpsProfileId[] = ["ess", "charger", "lorawan"];

export function modeLabel(mode: OpsMode, profileId: OpsProfileId, language: Language): string {
  if (profileId === "lorawan") {
    switch (mode) {
      case "auto": return pick(language, "常规巡检", "Patrol");
      case "boost": return pick(language, "高频追踪", "Track+");
      case "eco": return pick(language, "低功耗", "Low-Pwr");
      case "standby": return pick(language, "静默待机", "Standby");
    }
  }
  if (profileId === "charger") {
    switch (mode) {
      case "auto": return pick(language, "智能调度", "Smart");
      case "boost": return pick(language, "全速快充", "Boost");
      case "eco": return pick(language, "错峰限流", "Eco");
      case "standby": return pick(language, "停机待命", "Standby");
    }
  }
  switch (mode) {
    case "auto": return pick(language, "削峰填谷", "Auto");
    case "boost": return pick(language, "并网满放", "Discharge");
    case "eco": return pick(language, "经济备电", "Charge");
    case "standby": return pick(language, "待机隔离", "Standby");
  }
}

export function profileLabel(profileId: OpsProfileId, language: Language): string {
  if (profileId === "charger") return pick(language, "直流充电桩", "EV Charger");
  if (profileId === "lorawan") return pick(language, "LoRaWAN 监测", "LoRaWAN");
  return pick(language, "储能微网柜", "ESS Cabinet");
}

export function setpointTitle(profileId: OpsProfileId, language: Language): string {
  if (profileId === "lorawan") return pick(language, "网关发射限值", "TX Duty Limit");
  if (profileId === "charger") return pick(language, "输出功率上限", "Output Cap");
  return pick(language, "充放功率限值", "Power Limit");
}

export function setpointUnit(profileId: OpsProfileId): string {
  return profileId === "lorawan" ? "dBm" : "kW";
}

export function createInitialOpsState(options: {
  configured: boolean;
  configError: string;
  profileId: OpsProfileId;
  staleAfterSeconds: number;
  themeId: ThemeId;
  language: Language;
  muted: boolean;
  cachedSnapshot?: OpsTelemetrySnapshot | null;
  cachedEpoch?: number | null;
  clockEpochSeconds: number | null;
}): OpsState {
  const snap = options.cachedSnapshot ?? null;
  return {
    configured: options.configured,
    connected: false,
    configError: options.configError,
    error: "",
    profileId: snap?.profileId ?? options.profileId,
    staleAfterSeconds: options.staleAfterSeconds,
    snapshot: snap,
    lastReceivedEpoch: options.cachedEpoch ?? null,
    clockEpochSeconds: options.clockEpochSeconds,
    draftMode: snap?.mode ?? "auto",
    draftTargetKw: snap?.targetKw ?? 30,
    dirtyDraft: false,
    pendingCommand: null,
    receipt: null,
    themeId: options.themeId,
    language: options.language,
    muted: options.muted,
    nextCommandId: 1,
  };
}

export function computeFreshness(state: OpsState): Freshness {
  if (!state.snapshot) return "none";
  if (!state.connected) return "offline";
  if (
    state.clockEpochSeconds !== null &&
    state.lastReceivedEpoch !== null &&
    state.clockEpochSeconds - state.lastReceivedEpoch > state.staleAfterSeconds
  ) {
    return "stale";
  }
  return "live";
}

export function canControl(state: OpsState): boolean {
  return state.configured && computeFreshness(state) === "live" && state.pendingCommand === null;
}

export function unackedAlarmsCount(snapshot: OpsTelemetrySnapshot | null): number {
  if (!snapshot) return 0;
  let count = 0;
  for (const alarm of snapshot.alarms) if (!alarm.acked) count += 1;
  return count;
}

export function hasCriticalUnacked(snapshot: OpsTelemetrySnapshot | null): boolean {
  if (!snapshot) return false;
  return snapshot.alarms.some(alarm => !alarm.acked && alarm.severity === "critical");
}

export function hasNewCriticalAlarm(prev: OpsTelemetrySnapshot | null, next: OpsTelemetrySnapshot): boolean {
  const seen = new Set<string>();
  if (prev) {
    for (const alarm of prev.alarms) seen.add(`${alarm.id}:${alarm.acked ? 1 : 0}`);
  }
  return next.alarms.some(alarm =>
    alarm.severity === "critical" && !alarm.acked && !seen.has(`${alarm.id}:0`),
  );
}

export function statusLedColor(state: OpsState): readonly [number, number, number] {
  if (!state.configured && !state.snapshot) return [0, 0, 0];
  if (hasCriticalUnacked(state.snapshot)) return [180, 0, 0];
  const freshness = computeFreshness(state);
  if (freshness === "offline" || freshness === "stale" || unackedAlarmsCount(state.snapshot) > 0) {
    return [140, 75, 0];
  }
  if (freshness === "live") return [0, 90, 20];
  return [0, 30, 80];
}

export function clampSetpoint(value: number, snapshot: OpsTelemetrySnapshot | null): number {
  const min = snapshot?.minKw ?? 5;
  const max = snapshot?.maxKw ?? 60;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function sortedAlarms(alarms: readonly OpsAlarm[]): OpsAlarm[] {
  const rank = (alarm: OpsAlarm) => {
    if (alarm.acked) return 3;
    if (alarm.severity === "critical") return 0;
    if (alarm.severity === "warn") return 1;
    return 2;
  };
  return [...alarms].sort((a, b) => rank(a) - rank(b) || b.epoch - a.epoch);
}
