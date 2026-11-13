import { pick, type Language } from "./i18n";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDate(epochSeconds: number, offsetMinutes: number): Date {
  return new Date((epochSeconds + offsetMinutes * 60) * 1000);
}

export function formatTime(epochSeconds: number | null, offsetMinutes = 0): string {
  if (epochSeconds === null) return "--:--:--";
  const date = localDate(epochSeconds, offsetMinutes);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function formatDate(epochSeconds: number | null, offsetMinutes = 0, language: Language = "zh"): string {
  if (epochSeconds === null) return pick(language, "时间未同步", "RTC unset");
  const date = localDate(epochSeconds, offsetMinutes);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatTimezone(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${minutes ? `:${pad(minutes)}` : ""}`;
}

/** Home screen clock, "14:32"; "--:--" until the RTC holds a time. */
export function formatClock(epochSeconds: number | null, offsetMinutes = 0): string {
  if (epochSeconds === null) return "--:--";
  const date = localDate(epochSeconds, offsetMinutes);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "11月8日 星期日" or "Nov 8, Sunday"; a visible placeholder until the RTC holds a time. */
export function formatLocalizedDate(
  epochSeconds: number | null,
  offsetMinutes = 0,
  language: Language = "zh",
): string {
  if (epochSeconds === null) return pick(language, "时间未同步", "Time not synced");
  const date = localDate(epochSeconds, offsetMinutes);
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  return language === "en"
    ? `${MONTHS_EN[date.getUTCMonth()]} ${day}, ${WEEKDAYS_EN[weekday]}`
    : `${date.getUTCMonth() + 1}月${day}日 星期${WEEKDAYS_ZH[weekday]}`;
}

// A representative city for the common whole-hour offsets; the offset itself
// is what the firmware stores, so other offsets show just "UTC±h".
const OFFSET_CITIES: Record<number, { zh: string; en: string }> = {
  [-480]: { zh: "洛杉矶", en: "Los Angeles" },
  [-300]: { zh: "纽约", en: "New York" },
  0: { zh: "伦敦", en: "London" },
  60: { zh: "柏林", en: "Berlin" },
  420: { zh: "曼谷", en: "Bangkok" },
  480: { zh: "上海", en: "Shanghai" },
  540: { zh: "东京", en: "Tokyo" },
};

/** Settings row: "UTC+8 上海" or "UTC+8 Shanghai". */
export function timezoneLabel(offsetMinutes: number, language: Language = "zh"): string {
  const city = OFFSET_CITIES[offsetMinutes];
  return city ? `${formatTimezone(offsetMinutes)} ${pick(language, city.zh, city.en)}` : formatTimezone(offsetMinutes);
}
