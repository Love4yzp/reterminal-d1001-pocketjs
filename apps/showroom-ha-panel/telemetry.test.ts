import { describe, expect, test } from "bun:test";
import { agentText, armModeText, resultText, withFreshness } from "./telemetry";
import type { SensorReading } from "./showroom";

const reading = (value: string | null, status: SensorReading["status"] = "live"): SensorReading => ({
  value, status, updatedAt: value === null ? null : 100,
});

describe("console telemetry", () => {
  test("shows agent, last result and the three arm modes without inventing values", () => {
    expect(agentText(reading("online"))).toBe("在线");
    expect(agentText(reading("offline"))).toBe("离线");
    expect(resultText(reading("success"))).toBe("成功");
    expect(armModeText(reading("idle"))).toBe("idle");
    expect(armModeText(reading("playback"))).toBe("playback");
    expect(armModeText(reading("gravity"))).toBe("gravity");
    expect(armModeText(reading("moving"))).toBe("未知");
  });

  test("keeps freshness visible and does not send dynamic CJK to the baked atlas", () => {
    expect(agentText(reading(null, "pending"))).toBe("待接入");
    expect(agentText(reading("online", "offline"))).toBe("离线");
    expect(resultText(reading("中文动态回执"))).toBe("已更新");
    expect(resultText(reading("x".repeat(40)))).toHaveLength(28);
  });

  test("does not duplicate an empty or offline status", () => {
    expect(withFreshness(agentText(reading(null, "pending")), reading(null, "pending"))).toBe("待接入");
    expect(withFreshness(agentText(reading("online", "offline")), reading("online", "offline"))).toBe("离线");
    expect(withFreshness(agentText(reading("online", "mock")), reading("online", "mock"))).toBe("在线 · 示例");
  });
});
