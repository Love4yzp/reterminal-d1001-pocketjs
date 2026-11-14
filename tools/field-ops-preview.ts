// Host-side preview of apps/field-ops-panel: compile the package for D1001,
// boot it in PocketJS wasm core at 400x640 or 640x400 @2x, simulate worker
// snapshot + command readback, verify emitted worker commands, and save PNGs.
//
//   bun tools/field-ops-preview.ts --smoke
//   bun tools/field-ops-preview.ts [--landscape]
//   bun tools/field-ops-preview.ts --all

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWasmUi } from "../third_party/pocketjs/platforms/web/wasm-ops.js";
import { encodePNG } from "../third_party/pocketjs/tests/png.ts";
import {
  decodeMessage,
  encodeMessage,
  type OpsProfileId,
  type OpsTelemetrySnapshot,
  type WorkerCommand,
  type WorkerEvent,
} from "../apps/field-ops-panel/protocol";
import { readAppsPartition } from "./partitions";
import { assertFitsApps, pkapExtentBytes } from "./pkap";
import { LANDSCAPE_SHOTS, PORTRAIT_SHOTS, type Shot, type Touch } from "./field-ops-preview-shots";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const buildDirectory = resolve(root, ".pocket-build/preview/field-ops-panel");
const outDirectory = resolve(
  flag("out") ?? join(root, ".pocket-build/validation/field-ops", new Date().toISOString().replace(/[:.]/g, "-")),
);
const DENSITY = 2;
const CHANNEL_NAMES = ["ops-config", "ops-commands", "ops-events"];
const channelId = (name: string) => CHANNEL_NAMES.indexOf(name) + 1;
const PREVIEW_NOW = Math.floor(Date.UTC(2026, 10, 14, 9, 42, 0) / 1000);

function wasmPath(): string {
  const explicit = flag("wasm") ?? process.env.POCKETJS_WASM;
  if (explicit) return resolve(explicit);
  const vendored = resolve(root, "third_party/pocketjs/platforms/web/pocketjs.wasm");
  if (existsSync(vendored)) return vendored;
  const fallback = "/home/spencer/Projects/main/pocketjs-d1001/third_party/pocketjs/platforms/web/pocketjs.wasm";
  if (existsSync(fallback)) return fallback;
  throw new Error("pocketjs.wasm not found; pass --wasm=<path> or build it with bun third_party/pocketjs/tools/wasm.ts");
}

function compile() {
  const result = Bun.spawnSync([
    resolve(root, "tools/pocket"), "compile",
    "--manifest", resolve(root, "apps/field-ops-panel/pocket.app.json"),
    "--host-config", resolve(root, "programs/reterminal-d1001/pocket.host.config.ts"),
    "--project-root", resolve(root, "apps/field-ops-panel"),
    "--outdir", buildDirectory,
    "--output", `${buildDirectory}.pocket`,
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(`compile failed\n${result.stdout}${result.stderr}`);
  const bundle = statSync(`${buildDirectory}.pocket`).size;
  const partition = readAppsPartition(resolve(root, "programs/reterminal-d1001/partitions.csv")).size;
  const headroom = assertFitsApps(bundle, partition);
  console.log(`compiled field-ops-panel: .pocket ${bundle} bytes, PKAP extent ${pkapExtentBytes(bundle)}/${partition}, headroom ${headroom}`);
}

function fixtureSnapshots(): Record<OpsProfileId, OpsTelemetrySnapshot> {
  return {
    ess: {
      siteNameZh: "微网储能柜 #01",
      siteNameEn: "ESS Cabinet #01",
      unitId: "ESS-50K-01",
      profileId: "ess",
      revision: 12,
      updatedAtEpoch: PREVIEW_NOW,
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
        { id: "ess-101", severity: "critical", titleZh: "B组风道温度偏高", titleEn: "Rack B duct overtemp", source: "BMS-2", epoch: PREVIEW_NOW - 45, acked: false },
        { id: "ess-102", severity: "warn", titleZh: "单体压差 42mV", titleEn: "Cell delta 42mV", source: "BMS-1", epoch: PREVIEW_NOW - 180, acked: false },
        { id: "ess-103", severity: "info", titleZh: "峰谷计划已执行", titleEn: "TOU schedule active", source: "EMS", epoch: PREVIEW_NOW - 900, acked: true },
      ],
    },
    charger: {
      siteNameZh: "快充终端 #04",
      siteNameEn: "DC Charger #04",
      unitId: "EV-DC120-04",
      profileId: "charger",
      revision: 8,
      updatedAtEpoch: PREVIEW_NOW,
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
        { id: "ev-201", severity: "warn", titleZh: "A枪连接器温升偏快", titleEn: "Gun A thermal rise", source: "GUN-A", epoch: PREVIEW_NOW - 90, acked: false },
      ],
    },
    lorawan: {
      siteNameZh: "LoRaWAN 巡检网关",
      siteNameEn: "LoRaWAN Field GW",
      unitId: "T1000E-ZONE-A",
      profileId: "lorawan",
      revision: 19,
      updatedAtEpoch: PREVIEW_NOW,
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
        { id: "lora-301", severity: "critical", titleZh: "T1000-E #07 触发 SOS", titleEn: "T1000-E #07 SOS triggered", source: "ZONE-B", epoch: PREVIEW_NOW - 25, acked: false },
        { id: "lora-302", severity: "warn", titleZh: "T1000-E #11 超出电子围栏", titleEn: "T1000-E #11 geofence exit", source: "GATE-2", epoch: PREVIEW_NOW - 310, acked: false },
      ],
    },
  };
}

function installNativeStubs(options: { live: boolean; landscape: boolean }) {
  const g = globalThis as any;
  const snapshots = fixtureSnapshots();
  let activeProfile: OpsProfileId = "ess";
  let session = "";

  const files = new Map<string, string>();
  if (options.live) {
    files.set("ops-config.json", JSON.stringify({
      version: 1,
      baseUrl: "http://127.0.0.1:18124",
      token: "preview-token",
      profileId: "ess",
      staleAfterSeconds: 30,
      pollIntervalMs: 3000,
    }));
  } else {
    files.set("ops-cache.json", JSON.stringify({
      snapshot: snapshots.ess,
      receivedEpoch: PREVIEW_NOW - 120,
    }));
  }

  g.d1001 = {
    readRtc: () => PREVIEW_NOW,
    utcOffsetMinutes: () => 480,
    syncClock: () => "synchronized",
    setRgb: () => true,
    firmwareVersion: () => "host-preview",
    setScreenOffSeconds: () => true,
    landscape: () => options.landscape,
    setLandscape: () => true,
    savePanelState: (json: string) => { session = json; return true; },
    takePanelState: () => { const value = session; session = ""; return value; },
  };
  g.fs = {
    read: (path: string, offset: number, maxBytes: number) => {
      const source = files.get(path);
      if (source === undefined) return JSON.stringify({ error: "not found" });
      const bytes = new TextEncoder().encode(source).subarray(offset, offset + maxBytes);
      return JSON.stringify({ data: { $b: Buffer.from(bytes).toString("base64") }, size: bytes.length, eof: true });
    },
    write: (path: string, data: string) => {
      try {
        const value = JSON.parse(data) as string | { $b?: string };
        if (typeof value === "string") files.set(path, value);
        else if (value && typeof value === "object" && typeof value.$b === "string")
          files.set(path, Buffer.from(value.$b, "base64").toString("utf8"));
        else return 1;
        return 0;
      } catch {
        return 1;
      }
    },
    remove: (path: string) => { files.delete(path); return 0; },
    list: () => JSON.stringify({ entries: [], eof: true }),
    stat: (path: string) => {
      const source = files.get(path);
      return source === undefined ? "{}" : JSON.stringify({ kind: "file", size: new TextEncoder().encode(source).length });
    },
    mkdir: () => 0,
    rename: (from: string, to: string) => {
      const value = files.get(from);
      if (value === undefined) return 1;
      files.set(to, value);
      files.delete(from);
      return 0;
    },
    usage: () => JSON.stringify({ usedBytes: 0, quotaBytes: 0 }),
    lastError: () => "not found",
  };
  g.wifi = {
    status: () => JSON.stringify({
      state: "connected",
      ssid: "Site-Ops-2.4G",
      strength: 3,
      rssi: -52,
      address: "10.20.1.88",
      saved: [],
      error: "",
      scanning: false,
      networks: [],
    }),
    scan: () => false,
    setEnabled: () => true,
    connect: () => false,
    nextPreset: () => true,
  };
  let brightness = 85;
  g.device = {
    status: () => JSON.stringify({ display: { brightness }, error: "" }),
    setBrightness: (v: number) => { brightness = v; return true; },
    setSwitch: () => false,
  };
  g.audio = {
    createPcm: () => 1,
    writePcm: () => 0,
    playPcm: () => true,
    stopPcm: () => true,
    setVolume: () => true,
    pollPcm: () => 0,
  };

  const inbox = new Map<number, Uint8Array[]>();
  const commands: WorkerCommand[] = [];
  const deliver = (event: WorkerEvent) => {
    const bytes = new Uint8Array(1024);
    encodeMessage(event, bytes);
    const id = channelId("ops-events");
    inbox.set(id, [...(inbox.get(id) ?? []), bytes]);
  };
  const deliverSnapshot = (snapshot: OpsTelemetrySnapshot) => {
    const { alarms, ...summary } = snapshot;
    deliver({ type: "summary", summary });
    if (alarms.length === 0) {
      deliver({ type: "alarms-batch", profileId: snapshot.profileId, revision: snapshot.revision, reset: true, alarms: [] });
      return;
    }
    for (let i = 0; i < alarms.length; i += 2) {
      deliver({
        type: "alarms-batch",
        profileId: snapshot.profileId,
        revision: snapshot.revision,
        reset: i === 0,
        alarms: alarms.slice(i, i + 2),
      });
    }
  };

  g.__pocketWorkerChannels = {
    configure: () => 0,
    publish: (id: number, data: Uint8Array) => {
      if (id === channelId("ops-commands")) {
        const cmd = decodeMessage<WorkerCommand>(data);
        commands.push(cmd);
        if (options.live) {
          if (cmd.type === "set-profile") {
            activeProfile = cmd.profileId;
            deliverSnapshot(snapshots[activeProfile]);
          } else if (cmd.type === "setpoint") {
            const snap = snapshots[activeProfile];
            snap.mode = cmd.mode;
            snap.targetKw = cmd.targetKw;
            snap.powerKw = Math.round(cmd.targetKw * 0.85 * 10) / 10;
            snap.revision += 1;
            deliverSnapshot(snap);
            deliver({
              type: "command-result",
              commandId: cmd.commandId,
              ok: true,
              message: `Rev ${snap.revision}: ${cmd.mode} @ ${cmd.targetKw}`,
            });
          } else if (cmd.type === "ack-alarm") {
            const snap = snapshots[activeProfile];
            snap.alarms = snap.alarms.map(a => (a.id === cmd.alarmId ? { ...a, acked: true } : a));
            snap.revision += 1;
            deliverSnapshot(snap);
            deliver({
              type: "command-result",
              commandId: cmd.commandId,
              ok: true,
              message: `Acked ${cmd.alarmId}`,
            });
          } else if (cmd.type === "poll") {
            deliverSnapshot(snapshots[activeProfile]);
          }
        }
      }
      return 0;
    },
    observe: (id: number) => {
      const records = inbox.get(id) ?? [];
      inbox.delete(id);
      return records;
    },
  };

  return { commands, deliver, deliverSnapshot, initialSnapshot: () => snapshots[activeProfile] };
}

async function run(shots: readonly Shot[], options: { live: boolean; prefix: string; landscape: boolean; out: string }) {
  const width = options.landscape ? 640 : 400;
  const height = options.landscape ? 400 : 640;
  const wasmBytes = await Bun.file(wasmPath()).arrayBuffer();
  const source = await Bun.file(join(buildDirectory, "field-ops-panel.js")).text();
  const pak = await Bun.file(join(buildDirectory, "field-ops-panel.pak")).arrayBuffer();
  for (const shot of shots) {
    const wasm = await createWasmUi(wasmBytes, { width, height, rasterDensity: DENSITY });
    const g = globalThis as any;
    const bridge = installNativeStubs(options);
    g.ui = wasm.ops;
    g.__pak = pak;
    g.__simHz = 30;
    g.frame = undefined;
    (0, eval)(source);
    if (options.live) {
      bridge.deliver({ type: "status", configured: true, connected: true, error: "" });
      bridge.deliverSnapshot(bridge.initialSnapshot());
    } else {
      bridge.deliver({ type: "status", configured: false, connected: false, error: "" });
    }

    let touch: Touch = null;
    let hit = 0;
    const step = (next: Touch) => {
      if (next && !touch) hit = wasm.ops.hitTestBounds?.(next[0], next[1]) ?? 0;
      touch = next;
      g.__pocketWorkerChannelFrame?.();
      g.frame(0, 0x8080, touch ? [(touch[1] << 9) | touch[0]] : [], touch ? [hit] : [], touch ? [0] : [], 0x8080);
      wasm.tick();
    };
    for (let i = 0; i < 4; i++) step(null);
    for (const seg of shot.tape) for (let i = 0; i < seg.frames; i++) step(seg.touch);
    for (let i = 0; i < 4; i++) step(null);

    shot.verify?.(bridge.commands);
    const pixels = wasm.renderScaled(DENSITY);
    const path = join(options.out, `${options.prefix}${shot.name}.png`);
    writeFileSync(path, encodePNG(new Uint8Array(pixels), width * DENSITY, height * DENSITY));
    console.log(`wrote ${path}`);
    wasm.dispose();
  }
}

if (import.meta.main) {
  const started = performance.now();
  if (!args.includes("--no-build")) compile();
  const smoke = args.includes("--smoke");
  const both = smoke || args.includes("--all");
  const onlyFlag = flag("only");
  const only = smoke ? new Set(["overview"]) : onlyFlag ? new Set(onlyFlag.split(",").map(s => s.trim()).filter(Boolean)) : undefined;
  const orientations = both ? [false, true] : [args.includes("--landscape")];
  let count = 0;
  for (const landscape of orientations) {
    const out = both ? join(outDirectory, landscape ? "landscape" : "portrait") : outDirectory;
    const set = landscape ? LANDSCAPE_SHOTS : PORTRAIT_SHOTS;
    for (const [key, live, prefix] of [["live", true, ""], ["offline", false, "offline-"]] as const) {
      const shots = set[key].filter(s => !only || only.has(`${prefix}${s.name}`));
      if (shots.length === 0) continue;
      mkdirSync(out, { recursive: true });
      await run(shots, { live, prefix, landscape, out });
      count += shots.length;
    }
  }
  console.log(`rendered ${count} shot(s) in ${((performance.now() - started) / 1000).toFixed(1)} s -> ${outDirectory}`);
}
