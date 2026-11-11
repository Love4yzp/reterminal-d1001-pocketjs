import { describe, expect, test } from "bun:test";
import { formatDate, formatTime, formatTimezone } from "./clock";

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

  test("keeps an unset RTC visibly empty", () => {
    expect(formatTime(null, 480)).toBe("--:--:--");
    expect(formatDate(null, 480)).toBe("RTC unset");
  });
});
