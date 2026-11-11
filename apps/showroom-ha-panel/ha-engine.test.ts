import { describe, expect, test } from "bun:test";

import { HaEngine } from "./ha-engine";
import type { HttpRequest } from "./ha-request";
import type { LightState } from "./model";
import type { PanelHaConfig, WorkerEvent } from "./protocol";
import { SHOWROOM, SHOWROOM_ENTITY_MAP_EXAMPLE } from "./showroom";

interface Deferred {
  request: HttpRequest;
  resolve: (body: string, code?: number) => void;
  reject: (error: Error) => void;
}

const light = (on: boolean, brightness = 128): LightState => ({ on, brightness, hue: 30, saturation: 50 });

function config(map = true, arm = true): PanelHaConfig {
  const actions = {
    ...SHOWROOM_ENTITY_MAP_EXAMPLE.actions,
    ...(arm ? { "arm-gravity": "input_button.example_arm_gravity" } : {}),
  };
  return {
    baseUrl: "http://example.test:8123",
    token: "test-token",
    lightEntityId: "light.legacy",
    weatherEntityId: "weather.example",
    selftest: false,
    entityMap: map ? {
      version: 1,
      lights: { remote: "light.main", accent: "light.accent" },
      sensors: {
        temperature: "sensor.example_temperature",
        humidity: "sensor.example_humidity",
      },
      actions,
      weather: "weather.example",
    } : undefined,
  };
}

function deferredExecutor(shouldDefer: (url: string) => boolean = () => false) {
  const calls: HttpRequest[] = [];
  const pending = new Map<string, Deferred>();
  const execute = (request: HttpRequest) => {
    calls.push(request);
    if (!request.url.endsWith("/api/") && !shouldDefer(request.url)) {
      if (request.method === "POST") return Promise.resolve({ code: 200, body: "[]" });
      if (request.url.includes("/api/states/sensor.example_humidity"))
        return Promise.resolve({ code: 200, body: JSON.stringify({ state: "48" }) });
      if (request.url.includes("/api/states/weather."))
        return Promise.resolve({ code: 200, body: "null" });
      return Promise.resolve({ code: 200, body: JSON.stringify({ state: "off", attributes: {} }) });
    }
    return new Promise<{ code: number; body: string }>((resolve, reject) => {
      pending.set(`${request.method} ${request.url}`, {
        request,
        resolve: (body, code = 200) => resolve({ code, body }),
        reject: error => reject(error),
      });
    });
  };
  return { calls, pending, execute };
}

function immediateExecutor(state: Record<string, string>, services: { request: HttpRequest }[] = []) {
  return async (request: HttpRequest) => {
    if (request.method === "POST") {
      services.push({ request });
      return { code: 200, body: "[]" };
    }
    if (request.url.endsWith("/api/")) return { code: 200, body: JSON.stringify({ message: "API running." }) };
    const entity = decodeURIComponent(request.url.split("/api/states/")[1] ?? "");
    if (!(entity in state)) throw new Error("HTTP status 404");
    return { code: 200, body: state[entity]! };
  };
}

async function connected(engine: HaEngine) {
  engine.tick();
  await engine.idle();
}

describe("production HA engine", () => {
  test("probes again within two seconds while the network has no address", async () => {
    const urls: string[] = [];
    let online = false;
    const engine = new HaEngine(async request => {
      urls.push(request.url);
      if (!online) throw new Error("unavailable: the network has no address");
      return { code: 200, body: JSON.stringify({ message: "API running." }) };
    }, () => {});
    engine.setConfig(config());
    engine.tick();
    await engine.idle();
    online = true;
    for (let i = 0; i < 20; i += 1) engine.tick();
    await engine.idle();
    expect(urls.filter(url => url.endsWith("/api/"))).toHaveLength(2);
  });

  test("runs a keyed light command while a sensor poll is still blocked", async () => {
    const network = deferredExecutor(url => url.includes("sensor.example_temperature"));
    const events: WorkerEvent[] = [];
    const engine = new HaEngine(network.execute, event => events.push(event));
    engine.setConfig(config());
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    network.pending.get("GET http://example.test:8123/api/")!.resolve(JSON.stringify({ message: "API running." }));
    await engine.idle();
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    const sensorUrl = "GET http://example.test:8123/api/states/sensor.example_temperature";
    expect(network.pending.has(sensorUrl)).toBe(true);

    const command = engine.command({ type: "entity-light", lightId: "remote", light: light(true, 200), seq: 1 });
    await command;
    expect(network.calls.some(request => request.url.endsWith("/api/services/light/turn_on"))).toBe(true);
    expect(network.pending.has(sensorUrl)).toBe(true);
    network.pending.get(sensorUrl)!.resolve(JSON.stringify({ state: "21.5" }));
    await engine.idle();
  });

  test("drops an old light snapshot instead of overwriting a newer command", async () => {
    const network = deferredExecutor(url => url.includes("light.main"));
    const events: WorkerEvent[] = [];
    const engine = new HaEngine(network.execute, event => events.push(event));
    engine.setConfig(config());
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    network.pending.get("GET http://example.test:8123/api/")!.resolve(JSON.stringify({ message: "API running." }));
    await engine.idle();
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    const oldGet = network.pending.get("GET http://example.test:8123/api/states/light.main")!;
    await engine.command({ type: "entity-light", lightId: "remote", light: light(true, 220), seq: 1 });
    oldGet.resolve(JSON.stringify({ state: "off", attributes: {} }));
    await engine.idle();
    expect(events.filter(event => event.type === "entity-light" && event.lightId === "remote")).toEqual([]);
  });

  test("does not start a replacement poll while the light command is still running", async () => {
    const network = deferredExecutor(url => url.includes("light.main") || url.includes("/api/services/light/"));
    const engine = new HaEngine(network.execute, () => {});
    engine.setConfig(config());
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    network.pending.get("GET http://example.test:8123/api/")!.resolve(JSON.stringify({ message: "API running." }));
    await engine.idle();
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    const getUrl = "GET http://example.test:8123/api/states/light.main";
    const postUrl = "POST http://example.test:8123/api/services/light/turn_on";
    const oldGet = network.pending.get(getUrl)!;
    const command = engine.command({ type: "entity-light", lightId: "remote", light: light(true, 220), seq: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(network.pending.has(postUrl)).toBe(true);

    oldGet.resolve(JSON.stringify({ state: "off", attributes: {} }));
    await new Promise(resolve => setTimeout(resolve, 0));
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(network.calls.filter(request => request.method === "GET" && request.url.endsWith("light.main"))).toHaveLength(1);

    network.pending.get(postUrl)!.resolve("[]");
    await command;
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    network.pending.get(getUrl)!.resolve(JSON.stringify({ state: "on", attributes: { brightness: 220 } }));
    await engine.idle();
  });

  test("immediately replaces a stale poll after the command completes", async () => {
    const network = deferredExecutor(url => url.includes("light.main") || url.includes("/api/services/light/"));
    const events: WorkerEvent[] = [];
    const engine = new HaEngine(network.execute, event => events.push(event));
    engine.setConfig(config());
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    network.pending.get("GET http://example.test:8123/api/")!.resolve(JSON.stringify({ message: "API running." }));
    await engine.idle();
    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    const getUrl = "GET http://example.test:8123/api/states/light.main";
    const postUrl = "POST http://example.test:8123/api/services/light/turn_on";
    const oldGet = network.pending.get(getUrl)!;
    const command = engine.command({ type: "entity-light", lightId: "remote", light: light(true, 220), seq: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));
    network.pending.get(postUrl)!.resolve("[]");
    await command;
    oldGet.resolve(JSON.stringify({ state: "off", attributes: {} }));
    await engine.idle();

    engine.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(network.calls.filter(request => request.method === "GET" && request.url.endsWith("light.main"))).toHaveLength(2);
    network.pending.get(getUrl)!.resolve(JSON.stringify({ state: "on", attributes: { brightness: 220 } }));
    await engine.idle();
    expect(events).toContainEqual(expect.objectContaining({
      type: "entity-light", lightId: "remote", light: expect.objectContaining({ on: true, brightness: 220 }),
    }));
  });

  test("isolates an unavailable light and failed sensor from healthy entities and the connection", async () => {
    const services: { request: HttpRequest }[] = [];
    const events: WorkerEvent[] = [];
    const engine = new HaEngine(immediateExecutor({
      "light.main": JSON.stringify({ state: "unavailable", attributes: {} }),
      "light.accent": JSON.stringify({ state: "on", attributes: { brightness: 80, rgb_color: [255, 0, 0] } }),
      "sensor.example_humidity": JSON.stringify({ state: "48" }),
      "weather.example": "null",
    }, services), event => events.push(event));
    engine.setConfig(config());
    await connected(engine);
    engine.tick();
    await engine.idle();

    expect(events).toContainEqual(expect.objectContaining({ type: "entity-error", key: "remote", availability: "unavailable" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "entity-light", lightId: "accent" }));
    expect(events.some(event => event.type === "entity-error" && event.key === "temperature")).toBe(true);
    expect(events.some(event => event.type === "sensor" && event.sensorId === "humidity" && event.reading.value === 48)).toBe(true);
    expect(events.some(event => event.type === "status" && event.connected)).toBe(true);
  });

  test("sends exact brightness, RGB and Kelvin bodies with per-light error isolation", async () => {
    const services: { request: HttpRequest }[] = [];
    const events: WorkerEvent[] = [];
    const executor = immediateExecutor({}, services);
    const engine = new HaEngine(async request => {
      if (request.method === "POST" && request.body?.includes("light.main")) throw new Error("HTTP status 503");
      return executor(request);
    }, event => events.push(event));
    engine.setConfig(config());
    await connected(engine);

    await engine.command({
      type: "entity-light", lightId: "remote", light: light(true, 64), seq: 1,
      command: { on: true, brightnessPct: 25 },
    });
    await engine.command({
      type: "entity-light", lightId: "accent", light: light(true), seq: 1,
      command: { on: true, rgbColor: [12, 34, 56] },
    });
    await engine.command({
      type: "entity-light", lightId: "remote", light: { ...light(true), colorTempKelvin: 2700 }, seq: 2,
      command: { on: true, colorTempKelvin: 2700 },
    });

    expect(services).toHaveLength(1);
    expect(JSON.parse(services[0]!.request.body!)).toEqual({ entity_id: "light.accent", rgb_color: [12, 34, 56] });
    expect(events.filter(event => event.type === "entity-error" && event.key === "remote")).toHaveLength(2);
    expect(events.some(event => event.type === "entity-error" && event.key === "accent")).toBe(false);
  });

  test("routes all six Reachy actions to their keyed input_button and reports acceptance", async () => {
    const services: { request: HttpRequest }[] = [];
    const events: WorkerEvent[] = [];
    const engine = new HaEngine(immediateExecutor({}, services), event => events.push(event));
    const panelConfig = config();
    engine.setConfig(panelConfig);
    await connected(engine);

    for (const [index, actionId] of SHOWROOM.home.actions.entries())
      await engine.command({ type: "action", actionId, runId: index + 1 });

    expect(services).toHaveLength(6);
    for (const [index, actionId] of SHOWROOM.home.actions.entries()) {
      expect(services[index]?.request.url).toBe("http://example.test:8123/api/services/input_button/press");
      expect(JSON.parse(services[index]!.request.body!)).toEqual({
        entity_id: panelConfig.entityMap!.actions[actionId],
      });
      expect(events).toContainEqual({ type: "action-result", actionId, runId: index + 1, status: "accepted", error: "" });
    }

    await engine.command({ type: "light", light: light(true) });
    expect(services.at(-1)?.request.url).toBe("http://example.test:8123/api/services/light/turn_on");
    expect(JSON.parse(services.at(-1)!.request.body!)).toMatchObject({ entity_id: "light.legacy" });
  });

  test("arm actions always dispatch through script.keymesh_dispatch, ignoring legacy mappings", async () => {
    const services: { request: HttpRequest }[] = [];
    const engine = new HaEngine(immediateExecutor({}, services), () => {});
    engine.setConfig(config());
    await connected(engine);
    await engine.command({ type: "action", actionId: "arm-gravity", runId: 1, confirmed: true });
    expect(services).toHaveLength(1);
    expect(services[0]!.request.url).toEndWith("/api/services/script/turn_on");
  });

  test("runs both arm scripts on a tap and reports acceptance", async () => {
    const services: { request: HttpRequest }[] = [];
    const events: WorkerEvent[] = [];
    const engine = new HaEngine(immediateExecutor({}, services), event => events.push(event));
    const panelConfig = config(true, false);
    panelConfig.entityMap!.actions["arm-gravity"] = "script.keymesh_dispatch";
    panelConfig.entityMap!.actions["arm-playback"] = "script.keymesh_dispatch";
    engine.setConfig(panelConfig);
    await connected(engine);

    await engine.command({ type: "action", actionId: "arm-gravity", runId: 1 });
    await engine.command({ type: "action", actionId: "arm-playback", runId: 2 });

    expect(services.map(service => service.request.url)).toEqual([
      "http://example.test:8123/api/services/script/turn_on",
      "http://example.test:8123/api/services/script/turn_on",
    ]);
    expect(services.map(service => JSON.parse(service.request.body!))).toEqual([
      {
        entity_id: "script.keymesh_dispatch",
        host: "hall-win-3bbkv8f",
        task: "arm-gravity-start",
        confirm: true,
      },
      {
        entity_id: "script.keymesh_dispatch",
        host: "hall-win-3bbkv8f",
        task: "arm-play",
        action: "act_db914a65db",
        confirm: true,
      },
    ]);
    expect(events).toContainEqual({ type: "action-result", actionId: "arm-gravity", runId: 1, status: "accepted", error: "" });
    expect(events).toContainEqual({ type: "action-result", actionId: "arm-playback", runId: 2, status: "accepted", error: "" });
  });
});
