import { describe, expect, test } from "bun:test";
import {
  canControl,
  clampSetpoint,
  computeFreshness,
  createInitialOpsState,
  hasNewCriticalAlarm,
  sortedAlarms,
  statusLedColor,
  unackedAlarmsCount,
} from "./model";
import type { OpsTelemetrySnapshot } from "./protocol";

const SAMPLE_SNAPSHOT: OpsTelemetrySnapshot = {
  siteNameZh: "微网储能柜 #01",
  siteNameEn: "ESS Cabinet #01",
  unitId: "ESS-50K-01",
  profileId: "ess",
  revision: 4,
  updatedAtEpoch: 1700000000,
  heroPercent: 78,
  heroLabelZh: "电池电量 SoC",
  heroLabelEn: "Battery SoC",
  powerKw: 32.4,
  targetKw: 40,
  minKw: 5,
  maxKw: 60,
  mode: "auto",
  kpis: [
    { key: "bus", labelZh: "直流母线", labelEn: "DC Bus", value: "742", unit: "V", tone: "normal" },
    { key: "temp", labelZh: "电芯最高温", labelEn: "Max Cell", value: "31.2", unit: "°C", tone: "ok" },
    { key: "soh", labelZh: "健康度 SOH", labelEn: "SOH", value: "98", unit: "%", tone: "ok" },
    { key: "pcs", labelZh: "逆变模块", labelEn: "PCS", value: "在线", unit: "", tone: "ok" },
  ],
  alarms: [
    { id: "a1", severity: "info", titleZh: "策略切换", titleEn: "Mode changed", source: "EMS", epoch: 100, acked: true },
    { id: "a2", severity: "critical", titleZh: "风道过温", titleEn: "Airflow overtemp", source: "BMS-2", epoch: 200, acked: false },
    { id: "a3", severity: "warn", titleZh: "压差偏高", titleEn: "Cell delta high", source: "BMS-1", epoch: 150, acked: false },
  ],
};

function baseState() {
  return createInitialOpsState({
    configured: true,
    configError: "",
    profileId: "ess",
    staleAfterSeconds: 30,
    themeId: "cobalt",
    language: "zh",
    muted: false,
    cachedSnapshot: SAMPLE_SNAPSHOT,
    cachedEpoch: 1000,
    clockEpochSeconds: 1010,
  });
}

describe("field-ops model", () => {
  test("computes freshness and locks writes when offline or stale", () => {
    const offline = baseState();
    expect(computeFreshness(offline)).toBe("offline");
    expect(canControl(offline)).toBe(false);

    const live = { ...offline, connected: true };
    expect(computeFreshness(live)).toBe("live");
    expect(canControl(live)).toBe(true);

    const stale = { ...live, clockEpochSeconds: 1050 };
    expect(computeFreshness(stale)).toBe("stale");
    expect(canControl(stale)).toBe(false);
  });

  test("derives RGB LED colors from alarm severity and link freshness", () => {
    const s = { ...baseState(), connected: true };
    expect(statusLedColor(s)).toEqual([180, 0, 0]);

    const onlyWarn = {
      ...s,
      snapshot: { ...SAMPLE_SNAPSHOT, alarms: [SAMPLE_SNAPSHOT.alarms[2]!] },
    };
    expect(statusLedColor(onlyWarn)).toEqual([140, 75, 0]);

    const nominal = {
      ...s,
      snapshot: { ...SAMPLE_SNAPSHOT, alarms: [SAMPLE_SNAPSHOT.alarms[0]!] },
    };
    expect(statusLedColor(nominal)).toEqual([0, 90, 20]);
  });

  test("detects newly arrived unacked critical alarms", () => {
    const calm: OpsTelemetrySnapshot = { ...SAMPLE_SNAPSHOT, alarms: [SAMPLE_SNAPSHOT.alarms[0]!] };
    expect(hasNewCriticalAlarm(calm, SAMPLE_SNAPSHOT)).toBe(true);
    expect(hasNewCriticalAlarm(SAMPLE_SNAPSHOT, SAMPLE_SNAPSHOT)).toBe(false);
  });

  test("sorts alarms with unacked critical first and clamps setpoints", () => {
    const sorted = sortedAlarms(SAMPLE_SNAPSHOT.alarms);
    expect(sorted.map(a => a.id)).toEqual(["a2", "a3", "a1"]);
    expect(unackedAlarmsCount(SAMPLE_SNAPSHOT)).toBe(2);
    expect(clampSetpoint(999, SAMPLE_SNAPSHOT)).toBe(60);
    expect(clampSetpoint(-5, SAMPLE_SNAPSHOT)).toBe(5);
  });
});
