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
