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
  readPower?(): string;
  setRgb(red: number, green: number, blue: number): boolean;
  firmwareVersion(): string;
  landscape(): boolean;
  setLandscape(landscape: boolean): boolean;
  savePanelState(json: string): boolean;
  takePanelState(): string;
}

export type ClockSyncState = "offline" | "pending" | "synchronized" | "error";

export type ChargeState =
  | "usb_absent"
  | "charging"
  | "usb_idle"
  | "inconsistent"
  | "unavailable";

export interface PowerInfo {
  available: boolean;
  batteryMv: number | null;
  batteryPercent: number | null;
  usbMv: number | null;
  usbPresent: boolean;
  charging: boolean;
  chargeState: ChargeState;
}

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

const UNAVAILABLE_POWER: PowerInfo = {
  available: false,
  batteryMv: null,
  batteryPercent: null,
  usbMv: null,
  usbPresent: false,
  charging: false,
  chargeState: "unavailable",
};

function isChargeState(value: unknown): value is Exclude<ChargeState, "unavailable"> {
  return (
    value === "usb_absent" ||
    value === "charging" ||
    value === "usb_idle" ||
    value === "inconsistent"
  );
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

export function readPower(): PowerInfo {
  try {
    const raw = native()?.readPower?.();
    if (typeof raw !== "string" || raw.length === 0) return UNAVAILABLE_POWER;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || parsed.available !== true) return UNAVAILABLE_POWER;
    const percentRaw = finiteNonNegative(parsed.batteryPercent);
    if (percentRaw === null) return UNAVAILABLE_POWER;
    const chargeState = isChargeState(parsed.chargeState) ? parsed.chargeState : "unavailable";
    if (chargeState === "unavailable") return UNAVAILABLE_POWER;
    const usbPresent = typeof parsed.usbPresent === "boolean"
      ? parsed.usbPresent
      : chargeState === "charging" || chargeState === "usb_idle";
    return {
      available: true,
      batteryMv: finiteNonNegative(parsed.batteryMv),
      batteryPercent: Math.max(0, Math.min(100, percentRaw)),
      usbMv: finiteNonNegative(parsed.usbMv),
      usbPresent,
      charging: chargeState === "charging",
      chargeState,
    };
  } catch {
    return UNAVAILABLE_POWER;
  }
}

export function formatBatteryPercent(power: PowerInfo): string {
  return power.available && power.batteryPercent !== null ? `${power.batteryPercent}%` : "--%";
}

export function powerShortLabel(power: PowerInfo, language: Language = "zh"): string {
  if (!power.available) return unknownText(language);
  switch (power.chargeState) {
    case "charging":
      return pick(language, "USB 充电", "Charging");
    case "usb_idle":
      return pick(language, "USB 已连", "USB Ready");
    case "inconsistent":
      return pick(language, "电源异常", "Check Power");
    case "usb_absent":
      return pick(language, "电池供电", "Battery");
    default:
      return unknownText(language);
  }
}

export function powerStatusLabel(power: PowerInfo, language: Language = "zh"): string {
  if (!power.available) return pick(language, "不可用", "Unavailable");
  switch (power.chargeState) {
    case "charging":
      return pick(language, "USB 充电中", "USB Charging");
    case "usb_idle":
      return pick(language, "USB 已接入（未在充电）", "USB Connected (Idle)");
    case "inconsistent":
      return pick(language, "电源状态异常", "Power Inconsistent");
    case "usb_absent":
      return pick(language, "电池供电", "On Battery");
    default:
      return pick(language, "不可用", "Unavailable");
  }
}

export function powerDetailLabel(power: PowerInfo, language: Language = "zh"): string {
  if (!power.available) return pick(language, "不可用", "Unavailable");
  return `${formatBatteryPercent(power)} · ${powerStatusLabel(power, language)}`;
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
