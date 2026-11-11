// Host-side preview of apps/showroom-ha-panel: compile the package for the D1001 host
// profile, boot it in the PocketJS wasm core at 400x640 or 640x400 @2x and
// save PNGs after a scripted touch tape. No device, serial port or network is
// used; the native namespaces are stubbed with fixed fixtures.
//
//   bun tools/showroom-ha-panel-preview.ts --smoke             portrait + landscape home (daily loop)
//   bun tools/showroom-ha-panel-preview.ts --only=lights,settings [--landscape]
//   bun tools/showroom-ha-panel-preview.ts [--landscape]       full shot list for one orientation
//   bun tools/showroom-ha-panel-preview.ts --all               full shot list for both orientations
//
// Common flags: --wasm=<pocketjs.wasm> (or POCKETJS_WASM), --out=<dir>, --no-build.
// --only matches output names exactly: home, lights, offline-home, no-weather-home, ...

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWasmUi } from "../third_party/pocketjs/platforms/web/wasm-ops.js";
import { encodePNG } from "../third_party/pocketjs/tests/png.ts";
import { decodeMessage, encodeMessage, type WorkerCommand, type WorkerEvent } from "../apps/showroom-ha-panel/protocol";
import { SHOWROOM_ENTITY_MAP_EXAMPLE } from "../apps/showroom-ha-panel/showroom";
import { readAppsPartition } from "./partitions";
import { assertFitsApps, pkapExtentBytes } from "./pkap";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const buildDirectory = resolve(root, ".pocket-build/preview/showroom-ha-panel");
const outDirectory = resolve(flag("out") ?? join(root, ".pocket-build/validation/showroom-dashboard", new Date().toISOString().replace(/[:.]/g, "-")));
const DENSITY = 2;
const CHANNEL_NAMES = ["ha-config", "ha-entity-map", "ha-commands", "ha-events"];
const channelId = (name: string) => CHANNEL_NAMES.indexOf(name) + 1;

function wasmPath(): string {
  const explicit = flag("wasm") ?? process.env.POCKETJS_WASM;
  if (explicit) return resolve(explicit);
  const vendored = resolve(root, "third_party/pocketjs/platforms/web/pocketjs.wasm");
  if (existsSync(vendored)) return vendored;
  throw new Error("pocketjs.wasm not found; pass --wasm=<path> or build it with bun third_party/pocketjs/tools/wasm.ts");
}

function compile() {
  const result = Bun.spawnSync([
    resolve(root, "tools/pocket"), "compile",
    "--manifest", resolve(root, "apps/showroom-ha-panel/pocket.app.json"),
    "--host-config", resolve(root, "programs/reterminal-d1001/pocket.host.config.ts"),
    "--project-root", resolve(root, "apps/showroom-ha-panel"),
    "--outdir", buildDirectory,
    "--output", `${buildDirectory}.pocket`,
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(`compile failed\n${result.stdout}${result.stderr}`);
  // Guard the bytes app:push writes: the whole .pocket bundle as a PKAP extent.
  const bundle = statSync(`${buildDirectory}.pocket`).size;
  const partition = readAppsPartition(resolve(root, "programs/reterminal-d1001/partitions.csv")).size;
  const headroom = assertFitsApps(bundle, partition);
  console.log(`compiled showroom-ha-panel: .pocket ${bundle} bytes, PKAP extent ${pkapExtentBytes(bundle)}/${partition}, headroom ${headroom}`);
}

export type Touch = readonly [number, number] | null;
export interface NativeCalls {
  /** How many times the guest asked for the next station preset. */
  presetSwitches(): number;
}

export interface Shot {
  name: string;
  tape: readonly { frames: number; touch: Touch }[];
  verify?(commands: readonly WorkerCommand[], native: NativeCalls): void;
}

interface PreviewOptions {
  haConfigured: boolean;
  weather: boolean;
  prefix: string;
  landscape: boolean;
  out: string;
  armConfigured?: boolean;
}

/** Fixtures for the device namespaces the panel reads. */
function installNativeStubs(options: Pick<PreviewOptions, "haConfigured" | "armConfigured" | "landscape">) {
  const g = globalThis as any;
  let rgb = [0, 0, 0];
  let session = "";
  const entityMap = options.haConfigured ? {
    ...SHOWROOM_ENTITY_MAP_EXAMPLE,
    actions: {
      ...SHOWROOM_ENTITY_MAP_EXAMPLE.actions,
      ...(options.armConfigured ? {
        "arm-gravity": "input_button.example_arm_gravity",
        "arm-playback": "input_button.example_arm_playback",
      } : {}),
    },
  } : undefined;
  g.d1001 = {
    readRtc: () => Date.UTC(2026, 10, 8, 6, 32, 0) / 1000,
    utcOffsetMinutes: () => 480,
    syncClock: () => "synchronized",
    setRgb: (r: number, gr: number, b: number) => { rgb = [r, gr, b]; return true; },
    firmwareVersion: () => "host-preview",
    setScreenOffSeconds: () => true,
    landscape: () => options.landscape,
    setLandscape: () => true,
    savePanelState: (json: string) => { session = json; return true; },
    takePanelState: () => { const value = session; session = ""; return value; },
  };
  // The panel reads its HA configuration only from this slot's data.fs.
  const files = new Map<string, string>();
  if (options.haConfigured) {
    files.set("ha-panel.json", JSON.stringify({
      version: 1,
      baseUrl: "http://ha.local:8123",
      token: "preview",
      lightEntityId: "",
      weatherEntityId: entityMap?.weather ?? "",
      entityMap,
    }));
  }
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
    rename: (from: string, to: string) => { const value = files.get(from); if (value === undefined) return 1; files.set(to, value); files.delete(from); return 0; },
    usage: () => JSON.stringify({ usedBytes: 0, quotaBytes: 0 }),
    lastError: () => "not found",
  };
  let presetSwitches = 0;
  g.wifi = {
    status: () => JSON.stringify({ state: "connected", ssid: "Seeed-Demo", strength: 3, rssi: -52, address: "192.168.1.42", saved: [], error: "", scanning: false, networks: [] }),
    scan: () => false, setEnabled: () => true, connect: () => false,
    nextPreset: () => { presetSwitches += 1; return true; },
  };
  let brightness = 80;
  g.device = {
    status: () => JSON.stringify({ display: { brightness }, error: "" }),
    setBrightness: (value: number) => { brightness = value; return true; },
    setSwitch: () => false,
  };
  const inbox = new Map<number, Uint8Array[]>();
  const outbox: { id: number; data: Uint8Array }[] = [];
  const sent: WorkerCommand[] = [];
  g.__pocketWorkerChannels = {
    configure: () => 0,
    publish: (id: number, data: Uint8Array) => { outbox.push({ id, data: data.slice() }); return 0; },
    observe: (id: number) => { const records = inbox.get(id) ?? []; inbox.delete(id); return records; },
  };
  const deliver = (id: number, data: Uint8Array) => inbox.set(id, [...inbox.get(id) ?? [], data]);
  const emit = (event: WorkerEvent) => {
    const bytes = new Uint8Array(512);
    encodeMessage(event, bytes);
    deliver(channelId("ha-events"), bytes);
  };
  const pump = () => {
    for (const record of outbox.splice(0)) {
      if (record.id !== channelId("ha-commands")) continue;
      const command = decodeMessage<WorkerCommand>(record.data);
      sent.push(command);
      if (command.type === "action") {
        emit({ type: "action-result", actionId: command.actionId, runId: command.runId, status: "accepted", error: "" });
      } else if (command.type === "entity-light") {
        emit({ type: "entity-light", lightId: command.lightId, light: command.light });
      } else if (command.type === "light") {
        emit({ type: "entity-light", lightId: "remote", light: command.light });
      }
    }
  };
  return {
    rgb: () => rgb,
    brightness: () => brightness,
    presetSwitches: () => presetSwitches,
    sent,
    emit,
    pump,
  };
}

async function run(shots: readonly Shot[], options: PreviewOptions) {
  const width = options.landscape ? 640 : 400;
  const height = options.landscape ? 400 : 640;
  const wasmBytes = await Bun.file(wasmPath()).arrayBuffer();
  const source = await Bun.file(join(buildDirectory, "showroom-ha-panel.js")).text();
  const pak = await Bun.file(join(buildDirectory, "showroom-ha-panel.pak")).arrayBuffer();
  for (const shot of shots) {
    const wasm = await createWasmUi(wasmBytes, { width, height, rasterDensity: DENSITY });
    const g = globalThis as any;
    const bridge = installNativeStubs(options);
    g.ui = wasm.ops;
    g.__pak = pak;
    g.__simHz = 30;
    g.frame = undefined;
    (0, eval)(source);
    if (options.haConfigured) {
      bridge.emit({ type: "status", configured: true, connected: true, error: "" });
      bridge.emit({
        type: "entity-light",
        lightId: "remote",
        light: { on: false, brightness: 128, hue: 36, saturation: 70 },
      });
      bridge.emit({ type: "sensor", sensorId: "temperature", reading: { value: 21.5, status: "mock", updatedAt: 100 } });
      bridge.emit({ type: "sensor", sensorId: "humidity", reading: { value: 48, status: "mock", updatedAt: 100 } });
      bridge.emit({ type: "sensor", sensorId: "reachy-agent", reading: { value: "online", status: "mock", updatedAt: 100 } });
      bridge.emit({ type: "sensor", sensorId: "reachy-result", reading: { value: "retail_complete", status: "mock", updatedAt: 100 } });
      bridge.emit({ type: "sensor", sensorId: "arm-mode", reading: { value: "idle", status: "mock", updatedAt: 100 } });
      if (options.weather)
        bridge.emit({ type: "weather", weather: { entityId: "weather.home", condition: "partlycloudy", temperature: 18, unit: "°C" } });
    }
    let touch: Touch = null;
    let hit = 0;
    const step = (next: Touch) => {
      if (next && !touch) hit = wasm.ops.hitTestBounds?.(next[0], next[1]) ?? 0;
      touch = next;
      bridge.pump();
      g.__pocketWorkerChannelFrame?.();
      g.frame(0, 0x8080, touch ? [(touch[1] << 9) | touch[0]] : [], touch ? [hit] : [], touch ? [0] : [], 0x8080);
      wasm.tick();
    };
    for (let i = 0; i < 4; i++) step(null);
    for (const segment of shot.tape)
      for (let i = 0; i < segment.frames; i++) step(segment.touch);
    for (let i = 0; i < 10; i++) step(null);
    shot.verify?.(bridge.sent, bridge);
    const pixels = wasm.renderScaled(DENSITY);
    const path = join(options.out, `${options.prefix}${shot.name}.png`);
    writeFileSync(path, encodePNG(new Uint8Array(pixels), width * DENSITY, height * DENSITY));
    console.log(`wrote ${path}`);
    wasm.dispose();
  }
}

const tap = (x: number, y: number) => [{ frames: 2, touch: [x, y] as const }, { frames: 2, touch: null }];
const hold = (x: number, y: number) => [{ frames: 24, touch: [x, y] as const }, { frames: 2, touch: null }];
const drag = (x0: number, y0: number, x1: number, y1: number, frames = 10) => [
  ...Array.from({ length: frames + 1 }, (_, i) => ({
    frames: 1,
    touch: [Math.round(x0 + (x1 - x0) * i / frames), Math.round(y0 + (y1 - y0) * i / frames)] as const,
  })),
  { frames: 2, touch: null },
];
export const gestures = { tap, hold, drag };

type ShotSet = { connected: Shot[]; offline: Shot[]; noWeather: Shot[]; arm: Shot[] };
const VARIANTS = [
  { key: "connected", haConfigured: true, weather: true, prefix: "", armConfigured: false },
  { key: "offline", haConfigured: false, weather: false, prefix: "offline-", armConfigured: false },
  { key: "noWeather", haConfigured: true, weather: false, prefix: "no-weather-", armConfigured: false },
  { key: "arm", haConfigured: true, weather: true, prefix: "armed-", armConfigured: true },
] as const;

async function renderSet(set: ShotSet, landscape: boolean, out: string, only?: ReadonlySet<string>) {
  let count = 0;
  for (const variant of VARIANTS) {
    const shots = set[variant.key].filter(shot => !only || only.has(`${variant.prefix}${shot.name}`));
    if (shots.length === 0) continue;
    mkdirSync(out, { recursive: true });
    await run(shots, { ...variant, landscape, out });
    count += shots.length;
  }
  return count;
}

if (import.meta.main) {
  const started = performance.now();
  if (!args.includes("--no-build")) compile();
  const { SHOTS, LANDSCAPE_SHOTS } = await import("./showroom-ha-panel-preview-shots.ts");
  const smoke = args.includes("--smoke");
  const both = smoke || args.includes("--all");
  const onlyFlag = flag("only");
  const only = smoke ? new Set(["home"]) : onlyFlag ? new Set(onlyFlag.split(",").map(name => name.trim()).filter(Boolean)) : undefined;
  const orientations = both ? [false, true] : [args.includes("--landscape")];
  let count = 0;
  for (const landscape of orientations) {
    const out = both ? join(outDirectory, landscape ? "landscape" : "portrait") : outDirectory;
    count += await renderSet(landscape ? LANDSCAPE_SHOTS : SHOTS, landscape, out, only);
  }
  if (count === 0) throw new Error(`no shots matched${onlyFlag ? ` --only=${onlyFlag}` : ""}; see tools/showroom-ha-panel-preview-shots.ts`);
  console.log(`rendered ${count} shot(s) in ${((performance.now() - started) / 1000).toFixed(1)} s -> ${outDirectory}`);
}
