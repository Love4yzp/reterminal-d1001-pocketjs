import { deviceStatus, setBrightness } from "@pocketjs/framework/device";
import { wifiStatus, type WifiStatus } from "@pocketjs/framework/wifi";
import { pick, type Language } from "./i18n";
import type { ScreenOffNative } from "./settings";

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

export function savePanelState(json: string): boolean {
  return native()?.savePanelState(json) === true;
}

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

export function setNativeRgb(color: readonly [number, number, number]): boolean {
  try {
    return native()?.setRgb(...color) ?? false;
  } catch {
    return false;
  }
}

export function readFirmwareVersion(language: Language = "zh"): string {
  try {
    const version = native()?.firmwareVersion();
    return typeof version === "string" && version.length > 0 ? version : pick(language, "未知", "Unknown");
  } catch {
    return pick(language, "未知", "Unknown");
  }
}

export interface NetworkInfo {
  connected: boolean;
  ssid: string;
  address: string;
  strength: number;
  rssi: number | null;
}

export function readNetwork(language: Language = "zh"): NetworkInfo {
  const status = wifiStatus() as (WifiStatus & { rssi?: number }) | null;
  const connected = status?.state === "connected" && status.ssid.length > 0;
  const fallback = pick(language, "未连接", "Offline");
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
  return rssi === null ? pick(language, "未知", "Unknown") : `${rssi} dBm`;
}

interface PresetWifiOps {
  nextPreset?(): boolean;
}

function wifiOps(): PresetWifiOps | undefined {
  const wifi = (globalThis as { wifi?: PresetWifiOps }).wifi;
  return wifi && typeof wifi === "object" ? wifi : undefined;
}

export function canSwitchNetwork(): boolean {
  return typeof wifiOps()?.nextPreset === "function";
}

export function requestNextPreset(): boolean {
  try {
    return wifiOps()?.nextPreset?.() === true;
  } catch {
    return false;
  }
}

export function readBacklight(): number | null {
  const brightness = deviceStatus()?.display?.brightness;
  return typeof brightness === "number" && Number.isFinite(brightness) ? brightness : null;
}

export function writeBacklight(percent: number): boolean {
  return setBrightness(percent);
}
