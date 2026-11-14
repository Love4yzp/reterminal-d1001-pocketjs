import { describe, expect, test } from "bun:test";
import { decodeSession, encodeSession } from "./session";

describe("field-ops session persistence", () => {
  test("round-trips tab, theme, language, profile and screen timeout", () => {
    const encoded = encodeSession("control", "emerald", "en", "lorawan", true, {
      backlight: 85,
      screenOffSeconds: 60,
    });
    expect(decodeSession(encoded)).toEqual({
      version: 1,
      tab: "control",
      themeId: "emerald",
      language: "en",
      profileId: "lorawan",
      muted: true,
      screenOffSeconds: 60,
    });
  });

  test("rejects malformed snapshots gracefully", () => {
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("{bad")).toBeNull();
  });
});
