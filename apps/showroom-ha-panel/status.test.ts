import { describe, expect, test } from "bun:test";
import { haStatus } from "./status";

describe("HA status", () => {
  test("separates unconfigured, offline and connected", () => {
    expect(haStatus({ haConfigured: false, haConnected: false })).toEqual({ tone: "unconfigured", label: "连接中" });
    expect(haStatus({ haConfigured: true, haConnected: false })).toEqual({ tone: "offline", label: "连接中" });
    expect(haStatus({ haConfigured: true, haConnected: true })).toEqual({ tone: "connected", label: "已连接" });
  });

  test("translates connection labels without changing the tone", () => {
    expect(haStatus({ haConfigured: false, haConnected: false }, "en")).toEqual({ tone: "unconfigured", label: "Connecting" });
    expect(haStatus({ haConfigured: true, haConnected: false }, "en")).toEqual({ tone: "offline", label: "Connecting" });
    expect(haStatus({ haConfigured: true, haConnected: true }, "en")).toEqual({ tone: "connected", label: "Connected" });
  });
});
