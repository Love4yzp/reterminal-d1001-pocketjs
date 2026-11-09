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

export function formatDate(epochSeconds: number | null, offsetMinutes = 0): string {
  if (epochSeconds === null) return "RTC unset";
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

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** "11月8日 星期日"; a visible placeholder until the RTC holds a time. */
export function formatChineseDate(epochSeconds: number | null, offsetMinutes = 0): string {
  if (epochSeconds === null) return "时间未同步";
  const date = localDate(epochSeconds, offsetMinutes);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 星期${WEEKDAYS[date.getUTCDay()]}`;
}

// A representative city for the common whole-hour offsets; the offset itself
// is what the firmware stores, so other offsets show just "UTC±h".
const OFFSET_CITIES: Record<number, string> = {
  [-480]: "洛杉矶",
  [-300]: "纽约",
  0: "伦敦",
  60: "柏林",
  420: "曼谷",
  480: "上海",
  540: "东京",
};

/** Settings row: "UTC+8 上海". */
export function timezoneLabel(offsetMinutes: number): string {
  const city = OFFSET_CITIES[offsetMinutes];
  return city ? `${formatTimezone(offsetMinutes)} ${city}` : formatTimezone(offsetMinutes);
}
