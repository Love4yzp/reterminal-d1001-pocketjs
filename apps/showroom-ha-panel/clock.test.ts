import { describe, expect, test } from "bun:test";

import { formatDate, formatLocalizedDate, formatTime, formatTimezone, timezoneLabel } from "./clock";

describe("local clock formatting", () => {
  test("formats a known UTC epoch without a host timezone dependency", () => {
    const epoch = Date.UTC(2024, 0, 2, 3, 4, 5) / 1000;
    expect(formatTime(epoch)).toBe("03:04:05");
    expect(formatDate(epoch)).toBe("2024-01-02");
  });

  test("crosses a day boundary at UTC+8 without changing the RTC epoch", () => {
    const epoch = Date.UTC(2026, 10, 5, 23, 30, 0) / 1000;
    expect(formatTime(epoch, 480)).toBe("07:30:00");
    expect(formatDate(epoch, 480)).toBe("2026-11-06");
  });

  test("formats positive, negative, and fractional-hour timezone offsets", () => {
    expect(formatTimezone(0)).toBe("UTC");
    expect(formatTimezone(480)).toBe("UTC+8");
    expect(formatTimezone(-210)).toBe("UTC-3:30");
  });

  test("keeps an unset RTC visibly empty in both languages", () => {
    expect(formatTime(null, 480)).toBe("--:--:--");
    expect(formatDate(null, 480)).toBe("时间未同步");
    expect(formatDate(null, 480, "en")).toBe("RTC unset");
    expect(formatLocalizedDate(null, 480, "en")).toBe("Time not synced");
    expect(formatLocalizedDate(null, 480)).toBe("时间未同步");
  });

  test("spells the date, weekday and timezone city in Chinese and English", () => {
    const epoch = Date.UTC(2026, 10, 8, 6, 32, 0) / 1000;
    expect(formatLocalizedDate(epoch, 480)).toBe("11月8日 星期日");
    expect(formatLocalizedDate(epoch, 480, "en")).toBe("Nov 8, Sunday");
    expect(timezoneLabel(480)).toBe("UTC+8 上海");
    expect(timezoneLabel(480, "en")).toBe("UTC+8 Shanghai");
    expect(timezoneLabel(-300, "en")).toBe("UTC-5 New York");
  });
});
