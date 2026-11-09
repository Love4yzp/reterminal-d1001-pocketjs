// Host-side preview of apps/ha-panel: compile the package for the D1001 host
// profile, boot it in the PocketJS wasm core at 400x640 @2x and save PNGs
// after a scripted touch tape. No device, serial port or network is used;
// the native namespaces are stubbed with fixed fixtures.
//
//   bun tools/ha-panel-preview.ts [--wasm=<pocketjs.wasm>] [--out=<dir>] [--no-build]

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWasmUi } from "../third_party/pocketjs/platforms/web/wasm-ops.js";
import { encodePNG } from "../third_party/pocketjs/tests/png.ts";
import { encodeMessage, type WorkerEvent } from "../apps/ha-panel/protocol";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const buildDirectory = resolve(root, ".pocket-build/preview/ha-panel");
const outDirectory = resolve(flag("out") ?? join(root, ".pocket-build/validation/dashboard", new Date().toISOString().replace(/[:.]/g, "-")));
const WIDTH = 400;
const HEIGHT = 640;
const DENSITY = 2;

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
    "--manifest", resolve(root, "apps/ha-panel/pocket.app.json"),
    "--host-config", resolve(root, "programs/reterminal-d1001/pocket.host.config.ts"),
    "--project-root", resolve(root, "apps/ha-panel"),
    "--outdir", buildDirectory,
    "--output", `${buildDirectory}.pocket`,
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(`compile failed\n${result.stdout}${result.stderr}`);
  const pak = String(result.stdout).match(/pak: .*?(\d+) bytes/);
  console.log(`compiled ha-panel${pak ? ` (pak ${pak[1]} bytes)` : ""}`);
}

export type Touch = readonly [number, number] | null;
export interface Shot { name: string; tape: readonly { frames: number; touch: Touch }[] }

/** Fixtures for the device namespaces the panel reads. */
function installNativeStubs(options: { haConfigured: boolean }) {
  const g = globalThis as any;
  let rgb = [0, 0, 0];
  g.d1001 = {
    readRtc: () => Date.UTC(2026, 10, 8, 6, 32, 0) / 1000,
    utcOffsetMinutes: () => 480,
    syncClock: () => "synchronized",
    setRgb: (r: number, gr: number, b: number) => { rgb = [r, gr, b]; return true; },
    haConfig: () => options.haConfigured
      ? { baseUrl: "http://ha.local:8123", token: "preview", lightEntityId: "light.living_room", selftest: false }
      : { baseUrl: "", token: "", lightEntityId: "", selftest: false },
    firmwareVersion: () => "host-preview",
  };
  g.wifi = {
    status: () => JSON.stringify({ state: "connected", ssid: "Home-5G", strength: 3, address: "192.168.1.42", saved: [], error: "", scanning: false, networks: [] }),
    scan: () => false, setEnabled: () => true, connect: () => false,
  };
  let brightness = 80;
  g.device = {
    status: () => JSON.stringify({ display: { brightness }, error: "" }),
    setBrightness: (value: number) => { brightness = value; return true; },
    setSwitch: () => false,
  };
  // Worker channel bridge: UI publishes are recorded, worker events come from
  // the fixture queue and are delivered once on the next frame.
  const inbox = new Map<number, Uint8Array[]>();
  const outbox: { id: number; data: Uint8Array }[] = [];
  g.__pocketWorkerChannels = {
    configure: () => 0,
    publish: (id: number, data: Uint8Array) => { outbox.push({ id, data: data.slice() }); return 0; },
    observe: (id: number) => { const records = inbox.get(id) ?? []; inbox.delete(id); return records; },
  };
  const deliver = (id: number, data: Uint8Array) => inbox.set(id, [...inbox.get(id) ?? [], data]);
  return { rgb: () => rgb, brightness: () => brightness, outbox, deliver };
}

async function run(shots: readonly Shot[], options: { haConfigured: boolean; weather: boolean; prefix: string }) {
  const wasmBytes = await Bun.file(wasmPath()).arrayBuffer();
  const source = await Bun.file(join(buildDirectory, "ha-panel.js")).text();
  const pak = await Bun.file(join(buildDirectory, "ha-panel.pak")).arrayBuffer();
  for (const shot of shots) {
    const wasm = await createWasmUi(wasmBytes, { width: WIDTH, height: HEIGHT, rasterDensity: DENSITY });
    const g = globalThis as any;
    const bridge = installNativeStubs(options);
    g.ui = wasm.ops;
    g.__pak = pak;
    g.__simHz = 30;
    g.frame = undefined;
    (0, eval)(source);
    if (options.haConfigured) {
      const deliver = (event: WorkerEvent) => {
        const bytes = new Uint8Array(512);
        encodeMessage(event, bytes);
        bridge.deliver(3, bytes);
      };
      deliver({ type: "status", configured: true, connected: true, error: "" });
      deliver({ type: "light", light: { on: false, brightness: 128, hue: 36, saturation: 70 } });
      if (options.weather)
        deliver({ type: "weather", weather: { entityId: "weather.home", condition: "partlycloudy", temperature: 18, unit: "°C" } });
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
    for (const segment of shot.tape) for (let i = 0; i < segment.frames; i++) step(segment.touch);
    for (let i = 0; i < 4; i++) step(null);
    const pixels = wasm.renderScaled(DENSITY);
    const path = join(outDirectory, `${options.prefix}${shot.name}.png`);
    writeFileSync(path, encodePNG(new Uint8Array(pixels), WIDTH * DENSITY, HEIGHT * DENSITY));
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

if (import.meta.main) {
  if (!args.includes("--no-build")) compile();
  mkdirSync(outDirectory, { recursive: true });
  const { SHOTS } = await import("./ha-panel-preview-shots.ts");
  await run(SHOTS.connected, { haConfigured: true, weather: true, prefix: "" });
  await run(SHOTS.offline, { haConfigured: false, weather: false, prefix: "offline-" });
  await run(SHOTS.noWeather, { haConfigured: true, weather: false, prefix: "no-weather-" });
}
