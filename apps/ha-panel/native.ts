import { deviceStatus, setBrightness } from "@pocketjs/framework/device";
import { wifiStatus } from "@pocketjs/framework/wifi";
import type { PanelHaConfig } from "./protocol";
import type { ScreenOffNative } from "./settings";
import { parseShowroomEntityMap } from "./showroom";

/** `globalThis.d1001`, installed by programs/reterminal-d1001 (pocket_d1001). */
interface D1001Native extends ScreenOffNative {
  readRtc(): number;
  utcOffsetMinutes(): number;
  syncClock(): string;
  setRgb(red: number, green: number, blue: number): boolean;
  haConfig(): unknown;
  firmwareVersion(): string;
  landscape(): boolean;
  setLandscape(landscape: boolean): boolean;
  savePanelState(json: string): boolean;
  takePanelState(): string;
}

export type ClockSyncState = "offline" | "pending" | "synchronized" | "error";

export const NOT_CONNECTED_TEXT = "未连接";
export const UNKNOWN_TEXT = "未知";

function native(): D1001Native | undefined {
  return (globalThis as typeof globalThis & { d1001?: D1001Native }).d1001;
}

export function screenOffNative(): ScreenOffNative | undefined {
  return native();
}

export function readLandscape(): boolean {
  return native()?.landscape() === true;
}

export function requestLandscape(landscape: boolean): boolean {
  return native()?.setLandscape(landscape) === true;
}

/** Keep the UI session across the native orientation restart. */
export function savePanelState(json: string): boolean {
  return native()?.savePanelState(json) === true;
}

/** Read and clear the native session snapshot; empty when none is pending. */
export function takePanelState(): string {
  const value = native()?.takePanelState();
  return typeof value === "string" ? value : "";
}

export function readRtcSeconds(): number | null {
  const value = native()?.readRtc() ?? -1;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function readUtcOffsetMinutes(): number {
  const value = native()?.utcOffsetMinutes() ?? 0;
  return Number.isSafeInteger(value) && Math.abs(value) <= 24 * 60 ? value : 0;
}

export function syncNativeClock(): ClockSyncState {
  const value = native()?.syncClock() ?? "offline";
  return value === "pending" || value === "synchronized" || value === "offline" ? value : "error";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readHaConfig(): PanelHaConfig {
  const value = native()?.haConfig();
  if (typeof value !== "object" || value === null)
    return { baseUrl: "", token: "", lightEntityId: "", weatherEntityId: "", selftest: false };
  const candidate = value as Record<string, unknown>;
  let entityMap: PanelHaConfig["entityMap"];
  let configError = "";
  try {
    entityMap = parseShowroomEntityMap(text(candidate.entityMapJson));
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }
  return {
    baseUrl: text(candidate.baseUrl),
    token: text(candidate.token),
    lightEntityId: text(candidate.lightEntityId),
    weatherEntityId: entityMap?.weather ?? text(candidate.weatherEntityId),
    selftest: candidate.selftest === true,
    entityMap,
    configError,
  };
}

export function setNativeRgb(color: readonly [number, number, number]): boolean {
  return native()?.setRgb(...color) ?? false;
}

/** The running ESP-IDF image version, or 未知 when unavailable. */
export function readFirmwareVersion(): string {
  try {
    const version = native()?.firmwareVersion();
    return typeof version === "string" && version.length > 0 ? version : UNKNOWN_TEXT;
  } catch {
    return UNKNOWN_TEXT;
  }
}

export interface NetworkInfo {
  connected: boolean;
  /** SSID when connected, otherwise 未连接. */
  ssid: string;
  /** IPv4 address when connected, otherwise 未连接. */
  address: string;
  /** 0..3 bars. */
  strength: number;
}

export function readNetwork(): NetworkInfo {
  const status = wifiStatus();
  const connected = status?.state === "connected" && status.ssid.length > 0;
  return {
    connected,
    ssid: connected ? status!.ssid : NOT_CONNECTED_TEXT,
    address: connected && status!.address ? status!.address : NOT_CONNECTED_TEXT,
    strength: connected ? Math.max(0, Math.min(3, Math.round(status!.strength))) : 0,
  };
}

/** Backlight percent, or null when the host has no device module. */
export function readBacklight(): number | null {
  const brightness = deviceStatus()?.display?.brightness;
  return typeof brightness === "number" && Number.isFinite(brightness) ? brightness : null;
}

export function writeBacklight(percent: number): boolean {
  return setBrightness(percent);
}
