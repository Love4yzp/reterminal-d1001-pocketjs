import type { OpsMode, OpsProfileId, OpsTelemetrySnapshot } from "../apps/field-ops-panel/protocol";

const TOKEN = process.env.MOCK_OPS_TOKEN ?? "ops-demo-token";
const PORT = Number(process.env.MOCK_OPS_PORT ?? 18124);

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

const SNAPSHOTS: Record<OpsProfileId, OpsTelemetrySnapshot> = {
  ess: {
    siteNameZh: "微网储能柜 #01",
    siteNameEn: "ESS Cabinet #01",
    unitId: "ESS-50K-01",
    profileId: "ess",
    revision: 12,
    updatedAtEpoch: nowEpoch(),
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
      { key: "temp", labelZh: "最高电芯温", labelEn: "Max Cell", value: "31.4", unit: "°C", tone: "ok" },
      { key: "soh", labelZh: "电池健康", labelEn: "Pack SOH", value: "98", unit: "%", tone: "ok" },
      { key: "pcs", labelZh: "PCS 模块", labelEn: "PCS", value: "ON-GRID", unit: "", tone: "ok" },
    ],
    alarms: [
      { id: "ess-101", severity: "critical", titleZh: "B组风道温度偏高", titleEn: "Rack B duct overtemp", source: "BMS-2", epoch: nowEpoch() - 45, acked: false },
      { id: "ess-102", severity: "warn", titleZh: "单体压差 42mV", titleEn: "Cell delta 42mV", source: "BMS-1", epoch: nowEpoch() - 180, acked: false },
      { id: "ess-103", severity: "info", titleZh: "峰谷计划已执行", titleEn: "TOU schedule active", source: "EMS", epoch: nowEpoch() - 900, acked: true },
    ],
  },
  charger: {
    siteNameZh: "快充终端 #04",
    siteNameEn: "DC Charger #04",
    unitId: "EV-DC120-04",
    profileId: "charger",
    revision: 8,
    updatedAtEpoch: nowEpoch(),
    heroPercent: 64,
    heroLabelZh: "当前车辆 SoC",
    heroLabelEn: "Vehicle SoC",
    powerKw: 86.5,
    targetKw: 100,
    minKw: 20,
    maxKw: 120,
    mode: "boost",
    kpis: [
      { key: "volt", labelZh: "输出电压", labelEn: "Out Volt", value: "618", unit: "V", tone: "normal" },
      { key: "curr", labelZh: "输出电流", labelEn: "Current", value: "140", unit: "A", tone: "ok" },
      { key: "gun", labelZh: "枪头温度", labelEn: "Plug Temp", value: "44.0", unit: "°C", tone: "warn" },
      { key: "sess", labelZh: "已充能量", labelEn: "Session", value: "28.6", unit: "kWh", tone: "ok" },
    ],
    alarms: [
      { id: "ev-201", severity: "warn", titleZh: "A枪连接器温升偏快", titleEn: "Gun A thermal rise", source: "GUN-A", epoch: nowEpoch() - 90, acked: false },
      { id: "ev-202", severity: "info", titleZh: "绝缘检测通过", titleEn: "Insulation check OK", source: "CTRL", epoch: nowEpoch() - 420, acked: true },
    ],
  },
  lorawan: {
    siteNameZh: "LoRaWAN 巡检网关",
    siteNameEn: "LoRaWAN Field GW",
    unitId: "T1000E-ZONE-A",
    profileId: "lorawan",
    revision: 19,
    updatedAtEpoch: nowEpoch(),
    heroPercent: 92,
    heroLabelZh: "在线节点率",
    heroLabelEn: "Nodes Online",
    powerKw: 14.0,
    targetKw: 16,
    minKw: 2,
    maxKw: 20,
    mode: "auto",
    kpis: [
      { key: "nodes", labelZh: "在线 T1000-E", labelEn: "Active Tags", value: "11/12", unit: "", tone: "ok" },
      { key: "rssi", labelZh: "网关 RSSI", labelEn: "GW RSSI", value: "-84", unit: "dBm", tone: "normal" },
      { key: "sos", labelZh: "待处理 SOS", labelEn: "Open SOS", value: "1", unit: "", tone: "critical" },
      { key: "bat", labelZh: "最低节点电量", labelEn: "Min Tag Bat", value: "24", unit: "%", tone: "warn" },
    ],
    alarms: [
      { id: "lora-301", severity: "critical", titleZh: "T1000-E #07 触发 SOS", titleEn: "T1000-E #07 SOS triggered", source: "ZONE-B", epoch: nowEpoch() - 25, acked: false },
      { id: "lora-302", severity: "warn", titleZh: "T1000-E #11 超出电子围栏", titleEn: "T1000-E #11 geofence exit", source: "GATE-2", epoch: nowEpoch() - 310, acked: false },
      { id: "lora-303", severity: "info", titleZh: "网关信道校准完成", titleEn: "LoRa channel synced", source: "GW-01", epoch: nowEpoch() - 1200, acked: true },
    ],
  },
};

function profileFromUrl(url: URL): OpsProfileId {
  const p = url.searchParams.get("profile");
  return p === "charger" || p === "lorawan" ? p : "ess";
}

function authorized(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${TOKEN}`;
}

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,
  async fetch(req) {
    if (!authorized(req)) {
      return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/api/v1/ops/snapshot") {
      const profileId = profileFromUrl(url);
      const snap = SNAPSHOTS[profileId];
      snap.updatedAtEpoch = nowEpoch();
      console.log(`[mock-ops] GET snapshot profile=${profileId} rev=${snap.revision}`);
      return Response.json(snap);
    }
    if (req.method === "POST" && url.pathname === "/api/v1/ops/command") {
      const body = (await req.json()) as { profileId?: OpsProfileId; mode?: OpsMode; targetKw?: number; commandId?: number };
      const profileId = body.profileId && SNAPSHOTS[body.profileId] ? body.profileId : "ess";
      const snap = SNAPSHOTS[profileId];
      const nextTarget = typeof body.targetKw === "number"
        ? Math.max(snap.minKw, Math.min(snap.maxKw, Math.round(body.targetKw)))
        : snap.targetKw;
      const nextMode = body.mode ?? snap.mode;
      snap.targetKw = nextTarget;
      snap.mode = nextMode;
      snap.powerKw = nextMode === "standby" ? 0 : Math.min(nextTarget, Math.round((nextTarget * 0.85) * 10) / 10);
      snap.revision += 1;
      snap.updatedAtEpoch = nowEpoch();
      console.log(`[mock-ops] POST command profile=${profileId} mode=${nextMode} target=${nextTarget}`);
      return Response.json({
        ok: true,
        message: `Rev ${snap.revision}: ${nextMode} @ ${nextTarget}`,
        snapshot: snap,
      });
    }
    const ackMatch = /^\/api\/v1\/ops\/alarms\/([^/]+)\/ack$/.exec(url.pathname);
    if (req.method === "POST" && ackMatch) {
      const profileId = profileFromUrl(url);
      const alarmId = decodeURIComponent(ackMatch[1]!);
      const snap = SNAPSHOTS[profileId];
      snap.alarms = snap.alarms.map(a => (a.id === alarmId ? { ...a, acked: true } : a));
      snap.revision += 1;
      snap.updatedAtEpoch = nowEpoch();
      console.log(`[mock-ops] ACK alarm profile=${profileId} id=${alarmId}`);
      return Response.json({ ok: true, message: `Acked ${alarmId}`, snapshot: snap });
    }
    return Response.json({ ok: false, message: "Not found" }, { status: 404 });
  },
});

console.log(`[mock-ops] listening on http://0.0.0.0:${server.port} (profiles: ess, charger, lorawan)`);
