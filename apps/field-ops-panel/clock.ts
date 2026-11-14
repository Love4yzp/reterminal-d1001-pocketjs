import { pick, type Language } from "./i18n";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDate(epochSeconds: number, offsetMinutes: number): Date {
  return new Date((epochSeconds + offsetMinutes * 60) * 1000);
}

export function formatClock(epochSeconds: number | null, offsetMinutes = 0): string {
  if (epochSeconds === null) return "--:--";
  const date = localDate(epochSeconds, offsetMinutes);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatTime(epochSeconds: number | null, offsetMinutes = 0): string {
  if (epochSeconds === null) return "--:--:--";
  const date = localDate(epochSeconds, offsetMinutes);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatLocalizedDate(
  epochSeconds: number | null,
  offsetMinutes = 0,
  language: Language = "zh",
): string {
  if (epochSeconds === null) return pick(language, "时间未同步", "Time unset");
  const date = localDate(epochSeconds, offsetMinutes);
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  return language === "en"
    ? `${MONTHS_EN[date.getUTCMonth()]} ${day}, ${WEEKDAYS_EN[weekday]}`
    : `${date.getUTCMonth() + 1}月${day}日 周${WEEKDAYS_ZH[weekday]}`;
}

export function formatTimezone(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${minutes ? `:${pad(minutes)}` : ""}`;
}
