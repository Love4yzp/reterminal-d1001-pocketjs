import { sensorStatusText, type SensorReading } from "./showroom";

function hasValue(reading: SensorReading): boolean {
  return reading.value !== null && (reading.status === "live" || reading.status === "mock" || reading.status === "stale");
}

export function withFreshness(value: string, reading: SensorReading, error = ""): string {
  const status = sensorStatusText(reading, error);
  return value === status ? value : `${value} · ${status}`;
}

export function agentText(reading: SensorReading): string {
  if (!hasValue(reading)) return sensorStatusText(reading);
  return ["online", "connected", "ready", "true", "1"].includes(String(reading.value).toLowerCase())
    ? "在线"
    : "离线";
}

export function armModeText(reading: SensorReading): string {
  if (!hasValue(reading)) return sensorStatusText(reading);
  const mode = String(reading.value);
  return mode === "idle" || mode === "playback" || mode === "gravity" ? mode : "未知";
}

export function resultText(reading: SensorReading): string {
  if (!hasValue(reading)) return sensorStatusText(reading);
  const value = String(reading.value);
  const known: Record<string, string> = {
    success: "成功",
    ok: "成功",
    done: "完成",
    failed: "失败",
    error: "失败",
    running: "执行中",
    idle: "空闲",
  };
  if (known[value.toLowerCase()]) return known[value.toLowerCase()]!;
  if (!/^[\x20-\x7e]+$/.test(value)) return "已更新";
  return value.length <= 28 ? value : `${value.slice(0, 27)}…`;
}
