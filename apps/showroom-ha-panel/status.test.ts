import { describe, expect, test } from "bun:test";
import { haStatus } from "./status";

describe("HA status", () => {
  test("separates unconfigured, offline and connected", () => {
    expect(haStatus({ haConfigured: false, haConnected: false })).toEqual({ tone: "unconfigured", label: "未配置" });
    expect(haStatus({ haConfigured: true, haConnected: false })).toEqual({ tone: "offline", label: "未连接" });
    expect(haStatus({ haConfigured: true, haConnected: true })).toEqual({ tone: "connected", label: "已连接" });
  });
});
