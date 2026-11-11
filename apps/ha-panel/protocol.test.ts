import { describe, expect, test } from "bun:test";

import { decodeMessage, encodeMessage, statusErrorText } from "./protocol";
import { SHOWROOM_ENTITY_MAP_EXAMPLE } from "./showroom";

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

  test("fits keyed light and sensor mock events in the existing event record", () => {
    const bytes = new Uint8Array(512);
    encodeMessage({
      type: "entity-light",
      lightId: "accent",
      light: { on: true, brightness: 128, hue: 200, saturation: 50 },
    }, bytes);
    expect(decodeMessage<{ lightId: string }>(bytes).lightId).toBe("accent");

    encodeMessage({
      type: "sensor",
      sensorId: "temperature",
      reading: { value: 21.5, status: "mock", updatedAt: 100 },
    }, bytes);
    expect(decodeMessage<{ sensorId: string; reading: { status: string } }>(bytes)).toMatchObject({
      sensorId: "temperature", reading: { status: "mock" },
    });
  });

  test("round-trips production keyed commands and bounded entity results", () => {
    const commandBytes = new Uint8Array(1024);
    encodeMessage({
      type: "entity-light",
      lightId: "remote",
      light: { on: true, brightness: 200, hue: 30, saturation: 50 },
      command: { on: true, brightnessPct: 75 },
      seq: 7,
    }, commandBytes);
    expect(decodeMessage<{ lightId: string; seq: number }>(commandBytes)).toMatchObject({ lightId: "remote", seq: 7 });
    encodeMessage({ type: "action", actionId: "reachy-wake", runId: 4 }, commandBytes);
    expect(decodeMessage<{ actionId: string; runId: number }>(commandBytes)).toMatchObject({ actionId: "reachy-wake", runId: 4 });

    const eventBytes = new Uint8Array(512);
    encodeMessage({
      type: "entity-error",
      domain: "sensor",
      key: "temperature",
      availability: "offline",
      error: "x".repeat(160),
    }, eventBytes);
    expect(decodeMessage<{ key: string }>(eventBytes).key).toBe("temperature");
    encodeMessage({ type: "action-result", actionId: "reachy-wake", runId: 4, status: "accepted", error: "" }, eventBytes);
    expect(decodeMessage<{ runId: number; status: string }>(eventBytes)).toMatchObject({ runId: 4, status: "accepted" });
  });

  test("fits credentials and the public entity map in separate host-sized snapshots", () => {
    const { entityMap, ...wireConfig } = {
      baseUrl: "http://ha.local:8123",
      token: "x".repeat(182),
      lightEntityId: "",
      weatherEntityId: SHOWROOM_ENTITY_MAP_EXAMPLE.weather,
      selftest: false,
      entityMap: SHOWROOM_ENTITY_MAP_EXAMPLE,
    };
    const configBytes = new Uint8Array(1024);
    const mapBytes = new Uint8Array(1024);
    expect(encodeMessage(wireConfig, configBytes)).toBeLessThanOrEqual(configBytes.length);
    expect(encodeMessage(entityMap, mapBytes)).toBeLessThanOrEqual(mapBytes.length);
    expect(decodeMessage<typeof entityMap>(mapBytes)).toEqual(SHOWROOM_ENTITY_MAP_EXAMPLE);
  });
});
