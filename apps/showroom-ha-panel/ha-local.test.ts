import { afterEach, describe, expect, test } from "bun:test";
import type { FsOps } from "@pocketjs/framework/fs";
import {
  HA_CONFIG_PATH,
  parseLocalHaConfig,
  readLocalHaConfig,
  serializeLocalHaConfig,
  validateHaConfigMessages,
  writeLocalHaConfig,
} from "./ha-local";

const example = {
  version: 1,
  baseUrl: "http://example.test:8123",
  token: "local-test-token",
  lightEntityId: "",
  weatherEntityId: "",
  entityMap: {
    version: 1,
    lights: { remote: "light.example_main" },
    sensors: { temperature: "sensor.example_temperature" },
    actions: { "reachy-wake": "input_button.example_wake" },
    weather: "weather.example_home",
  },
};

const globalWithFs = globalThis as typeof globalThis & { fs?: unknown };
const originalFs = globalWithFs.fs;
afterEach(() => {
  if (originalFs === undefined) delete globalWithFs.fs;
  else globalWithFs.fs = originalFs;
});

function installFs() {
  const files = new Map<string, string>();
  const ops: FsOps = {
    read: (path, offset) => {
      const bytes = Buffer.from(files.get(path) ?? "", "utf8").subarray(offset);
      return JSON.stringify({ data: { $b: bytes.toString("base64") }, size: bytes.length, eof: true });
    },
    write: (path, data) => { files.set(path, JSON.parse(data) as string); return 0; },
    remove: path => { files.delete(path); return 0; },
    list: () => JSON.stringify({ entries: [] }),
    stat: path => JSON.stringify(files.has(path) ? { kind: "file", size: files.get(path)!.length } : {}),
    mkdir: () => 0,
    rename: (from, to) => { files.set(to, files.get(from)!); files.delete(from); return 0; },
    usage: () => JSON.stringify({ usedBytes: 0, quotaBytes: 0 }),
    lastError: () => "mock fs error",
  };
  globalWithFs.fs = ops;
  return files;
}

describe("slot-local HA configuration", () => {
  test("validates and serializes the showroom entity map", () => {
    const source = serializeLocalHaConfig(example);
    const config = parseLocalHaConfig(source);
    expect(config.baseUrl).toBe("http://example.test:8123");
    expect(config.entityMap?.lights.remote).toBe("light.example_main");
    expect(config.entityMap?.actions["reachy-wake"]).toBe("input_button.example_wake");
    expect(config.weatherEntityId).toBe("weather.example_home");
    expect(() => validateHaConfigMessages(config)).not.toThrow();
  });

  test("rejects missing credentials, invalid URLs, unknown fields and oversized messages", () => {
    expect(() => parseLocalHaConfig(JSON.stringify({ ...example, token: "" }))).toThrow("requires baseUrl and token");
    expect(() => parseLocalHaConfig(JSON.stringify({ ...example, baseUrl: "ftp://example.test" }))).toThrow("http");
    expect(() => parseLocalHaConfig(JSON.stringify({ ...example, password: "secret" }))).toThrow("unknown field password");
    expect(() => parseLocalHaConfig("not json")).toThrow("valid JSON");
    const oversized = { ...example, entityMap: { ...example.entityMap, lights: { remote: `light.${"x".repeat(1100)}` } } };
    expect(() => serializeLocalHaConfig(oversized)).toThrow();
  });

  test("writes and reads the same per-slot data.fs file", () => {
    const files = installFs();
    writeLocalHaConfig(JSON.stringify(example));
    expect(files.has(HA_CONFIG_PATH)).toBe(true);
    const config = readLocalHaConfig();
    expect(config?.token).toBe("local-test-token");
    expect(config?.entityMap?.actions["reachy-wake"]).toBe("input_button.example_wake");
  });

  test("returns undefined without data.fs and fails closed for damaged data", () => {
    delete globalWithFs.fs;
    expect(readLocalHaConfig()).toBeUndefined();
    const files = installFs();
    files.set(HA_CONFIG_PATH, "not json");
    const config = readLocalHaConfig();
    expect(config?.baseUrl).toBe("");
    expect(config?.token).toBe("");
    expect(config?.configError).toContain("valid JSON");
  });
});
