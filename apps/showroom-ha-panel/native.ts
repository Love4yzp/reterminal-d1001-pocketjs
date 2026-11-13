import { deviceStatus, setBrightness } from "@pocketjs/framework/device";
import { wifiStatus, type WifiStatus } from "@pocketjs/framework/wifi";
import { readLocalHaConfig } from "./ha-local";
import { pick, type Language } from "./i18n";
import type { PanelHaConfig } from "./protocol";
import type { ScreenOffNative } from "./settings";

/** `globalThis.d1001`, installed by programs/reterminal-d1001 (pocket_d1001). */
interface D1001Native extends ScreenOffNative {
  readRtc(): number;
  utcOffsetMinutes(): number;
  syncClock(): string;
  setRgb(red: number, green: number, blue: number): boolean;
  firmwareVersion(): string;
  landscape(): boolean;
  setLandscape(landscape: boolean): boolean;
  savePanelState(json: string): boolean;
  takePanelState(): string;
}

export type ClockSyncState = "offline" | "pending" | "synchronized" | "error";

export const NOT_CONNECTED_TEXT = "未连接";
export const UNKNOWN_TEXT = "未知";

export function notConnectedText(language: Language = "zh"): string {
  return pick(language, NOT_CONNECTED_TEXT, "Not connected");
}

export function unknownText(language: Language = "zh"): string {
  return pick(language, UNKNOWN_TEXT, "Unknown");
}

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

export function readHaConfig(): PanelHaConfig {
  return readLocalHaConfig() ?? {
    baseUrl: "",
    token: "",
    lightEntityId: "",
    weatherEntityId: "",
    selftest: false,
    configError: "",
  };
}

export function setNativeRgb(color: readonly [number, number, number]): boolean {
  return native()?.setRgb(...color) ?? false;
}

/** The running ESP-IDF image version, or 未知 when unavailable. */
export function readFirmwareVersion(language: Language = "zh"): string {
  try {
    const version = native()?.firmwareVersion();
    return typeof version === "string" && version.length > 0 ? version : unknownText(language);
  } catch {
    return unknownText(language);
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
  /** dBm when the firmware reports it, otherwise null. */
  rssi: number | null;
}

export function readNetwork(language: Language = "zh"): NetworkInfo {
  const status = wifiStatus() as (WifiStatus & { rssi?: number }) | null;
  const connected = status?.state === "connected" && status.ssid.length > 0;
  const fallback = notConnectedText(language);
  return {
    connected,
    ssid: connected ? status!.ssid : fallback,
    address: connected && status!.address ? status!.address : fallback,
    strength: connected ? Math.max(0, Math.min(3, Math.round(status!.strength))) : 0,
    rssi: connected && typeof status!.rssi === "number" && Number.isFinite(status!.rssi)
      ? Math.round(status!.rssi)
      : null,
  };
}

export function formatRssi(rssi: number | null, language: Language = "zh"): string {
  return rssi === null ? unknownText(language) : `${rssi} dBm`;
}

/** Older firmware images do not bind the optional next-preset op. */
export function canSwitchNetwork(): boolean {
  return typeof wifiOps()?.nextPreset === "function";
}

/** Ask the firmware to join the next configured station preset. */
export function requestNextPreset(): boolean {
  try {
    return wifiOps()?.nextPreset?.() === true;
  } catch {
    return false;
  }
}

interface PresetWifiOps {
  nextPreset?(): boolean;
}

function wifiOps(): PresetWifiOps | undefined {
  const wifi = (globalThis as { wifi?: PresetWifiOps }).wifi;
  return wifi && typeof wifi === "object" ? wifi : undefined;
}

/** Backlight percent, or null when the host has no device module. */
export function readBacklight(): number | null {
  const brightness = deviceStatus()?.display?.brightness;
  return typeof brightness === "number" && Number.isFinite(brightness) ? brightness : null;
}

export function writeBacklight(percent: number): boolean {
  return setBrightness(percent);
}
