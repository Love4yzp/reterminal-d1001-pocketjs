import { describe, expect, test } from "bun:test";
import { buildAckAlarmRequest, buildSetpointRequest, buildSnapshotRequest, parseCommandPayload, parseSnapshotPayload } from "./ops-request";
import { decodeMessage, encodeMessage } from "./protocol";

describe("field-ops protocol and requests", () => {
  test("round-trips non-ASCII JSON through fixed buffer", () => {
    const bytes = new Uint8Array(512);
    const written = encodeMessage({ message: "储能柜确认", ok: true }, bytes);
    expect(written).toBeGreaterThan(10);
    expect(decodeMessage<{ message: string; ok: boolean }>(bytes)).toEqual({ message: "储能柜确认", ok: true });
  });

  test("builds authenticated requests and parses snapshot/command replies", () => {
    const cfg = { baseUrl: "http://127.0.0.1:18124/", token: "secret-tok" };
    expect(buildSnapshotRequest(cfg, "lorawan").url).toBe("http://127.0.0.1:18124/api/v1/ops/snapshot?profile=lorawan");
    expect(buildSetpointRequest(cfg, "ess", "boost", 45, 7).body).toContain('"targetKw":45');
    expect(buildAckAlarmRequest(cfg, "ess", "alm-1").url).toContain("/alarms/alm-1/ack");

    const parsed = parseCommandPayload(JSON.stringify({
      ok: true,
      message: "Applied 45 kW",
      snapshot: {
        unitId: "ESS-1",
        heroPercent: 80,
        kpis: [],
      },
    }));
    expect(parsed.ok).toBe(true);
    expect(parsed.snapshot?.heroPercent).toBe(80);
    expect(() => parseSnapshotPayload("{}")).toThrow();
  });
});
