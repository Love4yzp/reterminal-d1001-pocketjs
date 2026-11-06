import { describe, expect, test } from "bun:test";
import { formatDate, formatTime } from "./clock";

describe("UTC clock formatting", () => {
  test("formats a known epoch without a host timezone dependency", () => {
    const epoch = Date.UTC(2024, 0, 2, 3, 4, 5) / 1000;
    expect(formatTime(epoch)).toBe("03:04:05");
    expect(formatDate(epoch)).toBe("2024-01-02 UTC");
  });

  test("keeps an unset RTC visibly empty", () => {
    expect(formatTime(null)).toBe("--:--:--");
    expect(formatDate(null)).toBe("RTC unset");
  });
});
