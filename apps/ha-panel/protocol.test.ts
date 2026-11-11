import { describe, expect, test } from "bun:test";

import { decodeMessage, encodeMessage, statusErrorText } from "./protocol";

describe("UI/worker message protocol", () => {
  test("round-trips non-ASCII code units through a fixed byte buffer", () => {
    const into = new Uint8Array(128);
    const written = encodeMessage({ text: "你好🙂", count: 2 }, into);

    expect(written).toBeGreaterThan(0);
    expect(into[written - 1]).toBe(0);
    expect(Array.from(into.subarray(0, written - 1)).every(byte => byte <= 0x7f)).toBe(true);
    expect(decodeMessage<{ text: string; count: number }>(into)).toEqual({ text: "你好🙂", count: 2 });
  });

  test("decodes only bytes before the first zero terminator", () => {
    const into = new Uint8Array(32);
    into.fill(0xff);
    encodeMessage({ ok: true }, into);

    expect(decodeMessage<{ ok: boolean }>(into)).toEqual({ ok: true });
  });

  test("uses all available JSON space but reserves one terminator byte", () => {
    const exact = new Uint8Array(4);
    expect(encodeMessage("a", exact)).toBe(4);
    expect(Array.from(exact)).toEqual([0x22, 0x61, 0x22, 0]);
    expect(decodeMessage<string>(exact)).toBe("a");

    expect(() => encodeMessage("a", new Uint8Array(3))).toThrow("overflow");
  });

  test("rejects values JSON.stringify cannot represent", () => {
    expect(() => encodeMessage(undefined, new Uint8Array(8))).toThrow("JSON");
  });

  test("bounds a long status error before encoding it into a 512-byte event", () => {
    const error = statusErrorText("x".repeat(2000));
    const bytes = new Uint8Array(512);
    expect(error).toHaveLength(160);
    expect(() => encodeMessage({ type: "status", configured: true, connected: false, error }, bytes)).not.toThrow();
    expect(decodeMessage<{ error: string }>(bytes).error).toBe(error);
  });
});
