function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTime(epochSeconds: number | null): string {
  if (epochSeconds === null) return "--:--:--";
  const date = new Date(epochSeconds * 1000);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function formatDate(epochSeconds: number | null): string {
  if (epochSeconds === null) return "RTC unset";
  const date = new Date(epochSeconds * 1000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} UTC`;
}
