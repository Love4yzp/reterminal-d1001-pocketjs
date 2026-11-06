import type { SensorSample, Vector3 } from "./model";
import type { PanelHaConfig } from "./protocol";

interface D1001Native {
  readRtc(): number;
  utcOffsetMinutes(): number;
  syncClock(): string;
  readSensors(): string;
  setRgb(red: number, green: number, blue: number): boolean;
  haConfig(): unknown;
}

export type ClockSyncState = "offline" | "pending" | "synchronized" | "error";

function native(): D1001Native | undefined {
  return (globalThis as typeof globalThis & { d1001?: D1001Native }).d1001;
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

function vector(value: unknown): Vector3 | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === "number" && Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" && Number.isFinite(candidate.y) &&
    typeof candidate.z === "number" && Number.isFinite(candidate.z)
    ? { x: candidate.x, y: candidate.y, z: candidate.z }
    : null;
}

export function readNativeSensors(): SensorSample | null {
  const binding = native();
  if (!binding) return null;
  try {
    const value = JSON.parse(binding.readSensors()) as Record<string, unknown>;
    if (value.available !== true) return null;
    const acceleration = vector(value.acceleration);
    const angularRate = vector(value.angularRate);
    if (!acceleration || !angularRate || typeof value.chipCelsius !== "number" ||
        !Number.isFinite(value.chipCelsius)) return null;
    return { acceleration, angularRate, chipCelsius: value.chipCelsius };
  } catch {
    return null;
  }
}

export function readHaConfig(): PanelHaConfig {
  const value = native()?.haConfig();
  if (typeof value !== "object" || value === null)
    return { baseUrl: "", token: "", lightEntityId: "", selftest: false };
  const candidate = value as Record<string, unknown>;
  return {
    baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl : "",
    token: typeof candidate.token === "string" ? candidate.token : "",
    lightEntityId: typeof candidate.lightEntityId === "string" ? candidate.lightEntityId : "",
    selftest: candidate.selftest === true,
  };
}

export function setNativeRgb(color: readonly [number, number, number]): boolean {
  return native()?.setRgb(...color) ?? false;
}
