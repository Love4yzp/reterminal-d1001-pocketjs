import { createHash, timingSafeEqual } from "node:crypto";
import { SHOWROOM, SHOWROOM_ENTITY_MAP_EXAMPLE } from "../apps/ha-panel/showroom";

const LIGHT_ENTITY_ID = SHOWROOM_ENTITY_MAP_EXAMPLE.lights.remote!;
const LEGACY_SENSOR_ENTITY_IDS = new Set([
  "sensor.d1001_accel_x",
  "sensor.d1001_accel_y",
  "sensor.d1001_accel_z",
  "sensor.d1001_gyro_x",
  "sensor.d1001_gyro_y",
  "sensor.d1001_gyro_z",
  "sensor.d1001_chip_temperature",
]);
const BUTTON_ENTITY_IDS = new Set([
  ...Object.values(SHOWROOM_ENTITY_MAP_EXAMPLE.actions),
  "input_button.example_arm_gravity",
  "input_button.example_arm_playback",
]);

type JsonObject = Record<string, unknown>;
type SafeBody = Record<string, unknown>;
type Rgb = [number, number, number];

interface Lamp {
  on: boolean;
  brightness: number;
  rgbColor: Rgb;
  colorTempKelvin?: number;
}

export interface MockHaController {
  server: ReturnType<typeof Bun.serve>;
  lights: Record<string, Lamp>;
  serviceCalls: { domain: string; service: string; entityId: string }[];
  fail(entityId: string, status: number): void;
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RequestError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function isRgb(value: unknown): value is Rgb {
  return Array.isArray(value) && value.length === 3 && value.every(isByte);
}

function isKelvin(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1_000 && value <= 10_000;
}

function tokensEqual(presented: string, expected: string): boolean {
  const presentedHash = createHash("sha256").update(presented, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

function authorized(request: Request, token: string): boolean {
  const authorization = request.headers.get("Authorization");
  const presented = authorization !== null && /^Bearer /i.test(authorization)
    ? authorization.slice(7)
    : "";
  return tokensEqual(presented, token);
}

async function readObject(request: Request): Promise<JsonObject> {
  let value: unknown;
  try {
    value = JSON.parse(await request.text()) as unknown;
  } catch {
    throw new RequestError(400, "invalid JSON body");
  }
  if (!isObject(value)) throw new RequestError(400, "JSON body must be an object");
  return value;
}

function context() {
  return { id: "mock-ha", parent_id: null, user_id: null };
}

function entityState(entityId: string, state: string, attributes: JsonObject) {
  const now = new Date().toISOString();
  return {
    entity_id: entityId,
    state,
    attributes,
    last_changed: now,
    last_updated: now,
    context: context(),
  };
}

function newLamp(): Lamp {
  return { on: false, brightness: 128, rgbColor: [255, 255, 255] };
}

export function createMockHa(options: {
  token: string;
  hostname?: string;
  port?: number;
  quiet?: boolean;
}): MockHaController {
  const lights: Record<string, Lamp> = {
    [LIGHT_ENTITY_ID]: newLamp(),
    "light.example_accent": newLamp(),
  };
  const serviceCalls: MockHaController["serviceCalls"] = [];
  const failures = new Map<string, number>();
  let lastResult = "idle";
  const quiet = options.quiet ?? true;

  function respond(request: Request, path: string, status: number, value: unknown, safeBody?: SafeBody): Response {
    if (!quiet) console.log(JSON.stringify({ method: request.method, path, status, body: safeBody }));
    return new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  function lightState(entityId: string) {
    const lamp = lights[entityId]!;
    return entityState(entityId, lamp.on ? "on" : "off", {
      friendly_name: `Mock ${entityId}`,
      brightness: lamp.brightness,
      rgb_color: lamp.rgbColor,
      ...(lamp.colorTempKelvin === undefined ? {} : { color_temp_kelvin: lamp.colorTempKelvin }),
      color_mode: lamp.colorTempKelvin === undefined ? "rgb" : "color_temp",
      supported_color_modes: ["rgb", "color_temp"],
      supported_features: 0,
    });
  }

  function updateLight(body: JsonObject, turnOn: boolean): { entityId: string; safeBody: SafeBody } {
    if (typeof body.entity_id !== "string" || !lights[body.entity_id])
      throw new RequestError(400, "entity_id must name a configured mock light");
    const entityId = body.entity_id;
    const lamp = lights[entityId]!;
    if (turnOn && body.brightness_pct !== undefined && !isPercent(body.brightness_pct))
      throw new RequestError(400, "brightness_pct must be an integer from 0 to 100");
    if (turnOn && body.rgb_color !== undefined && !isRgb(body.rgb_color))
      throw new RequestError(400, "rgb_color must contain three integers from 0 to 255");
    if (turnOn && body.color_temp_kelvin !== undefined && !isKelvin(body.color_temp_kelvin))
      throw new RequestError(400, "color_temp_kelvin must be an integer from 1000 to 10000");
    if (turnOn && body.rgb_color !== undefined && body.color_temp_kelvin !== undefined)
      throw new RequestError(400, "rgb_color and color_temp_kelvin are mutually exclusive");

    if (turnOn) {
      lamp.on = true;
      if (body.brightness_pct !== undefined) lamp.brightness = Math.round((body.brightness_pct as number) * 255 / 100);
      if (body.rgb_color !== undefined) {
        lamp.rgbColor = body.rgb_color as Rgb;
        lamp.colorTempKelvin = undefined;
      }
      if (body.color_temp_kelvin !== undefined) lamp.colorTempKelvin = body.color_temp_kelvin as number;
    } else {
      lamp.on = false;
    }
    const safeBody: SafeBody = { entity_id: entityId };
    if (turnOn && body.brightness_pct !== undefined) safeBody.brightness_pct = body.brightness_pct;
    if (turnOn && body.rgb_color !== undefined) safeBody.rgb_color = body.rgb_color;
    if (turnOn && body.color_temp_kelvin !== undefined) safeBody.color_temp_kelvin = body.color_temp_kelvin;
    return { entityId, safeBody };
  }

  function configuredState(entityId: string) {
    const map = SHOWROOM_ENTITY_MAP_EXAMPLE;
    if (lights[entityId]) return lightState(entityId);
    if (entityId === map.sensors.temperature)
      return entityState(entityId, "21.5", { unit_of_measurement: "°C", device_class: "temperature", friendly_name: "Mock temperature" });
    if (entityId === map.sensors.humidity)
      return entityState(entityId, "48", { unit_of_measurement: "%", device_class: "humidity", friendly_name: "Mock humidity" });
    if (entityId === map.sensors["reachy-agent"])
      return entityState(entityId, "online", { friendly_name: "Mock Reachy agent" });
    if (entityId === map.sensors["reachy-result"])
      return entityState(entityId, lastResult, { friendly_name: "Mock Reachy last result" });
    if (entityId === map.sensors["arm-mode"])
      return entityState(entityId, "idle", { friendly_name: "Mock arm mode" });
    if (entityId === map.weather)
      return entityState(entityId, "partlycloudy", { temperature: 18, temperature_unit: "°C", friendly_name: "Mock weather" });
    return undefined;
  }

  function legacySensorState(body: JsonObject, entityId: string) {
    if (typeof body.state !== "number" || !Number.isFinite(body.state))
      throw new RequestError(400, "sensor state must be a finite number");
    if (!isObject(body.attributes)) throw new RequestError(400, "sensor attributes must be an object");
    const attributes = body.attributes;
    if (typeof attributes.unit_of_measurement !== "string" || !attributes.unit_of_measurement)
      throw new RequestError(400, "unit_of_measurement is required");
    if (attributes.device_class !== null && typeof attributes.device_class !== "string")
      throw new RequestError(400, "device_class must be a string or null");
    if (typeof attributes.friendly_name !== "string" || !attributes.friendly_name)
      throw new RequestError(400, "friendly_name is required");
    const safeAttributes = {
      unit_of_measurement: attributes.unit_of_measurement,
      device_class: attributes.device_class,
      friendly_name: attributes.friendly_name,
    };
    return {
      response: entityState(entityId, String(body.state), safeAttributes),
      safeBody: { state: body.state, attributes: safeAttributes },
    };
  }

  function pressButton(body: JsonObject): SafeBody {
    if (typeof body.entity_id !== "string" || !BUTTON_ENTITY_IDS.has(body.entity_id))
      throw new RequestError(404, "unknown mock input_button");
    const action = SHOWROOM.actions.find(candidate => candidate.entityId === body.entity_id);
    lastResult = `${action?.key ?? (body.entity_id.includes("arm_gravity") ? "arm-gravity" : "arm-playback")}_accepted`;
    return { entity_id: body.entity_id };
  }

  const server = Bun.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (!authorized(request, options.token))
        return respond(request, path, 401, { error: "unauthorized" });
      try {
        if (request.method === "GET" && path === "/api/")
          return respond(request, path, 200, { message: "API running." });
        if (request.method === "GET" && path.startsWith("/api/states/")) {
          const entityId = decodeURIComponent(path.slice("/api/states/".length));
          if (failures.has(entityId))
            return respond(request, path, failures.get(entityId)!, { error: "injected mock failure" });
          const state = configuredState(entityId);
          return state
            ? respond(request, path, 200, state)
            : respond(request, path, 404, { error: "unknown entity" });
        }
        if (request.method === "POST" &&
          (path === "/api/services/light/turn_on" || path === "/api/services/light/turn_off")) {
          const body = await readObject(request);
          const turnOn = path.endsWith("/turn_on");
          const { entityId, safeBody } = updateLight(body, turnOn);
          serviceCalls.push({ domain: "light", service: turnOn ? "turn_on" : "turn_off", entityId });
          return respond(request, path, 200, [lightState(entityId)], safeBody);
        }
        if (request.method === "POST" && path === "/api/services/input_button/press") {
          const body = await readObject(request);
          const safeBody = pressButton(body);
          serviceCalls.push({ domain: "input_button", service: "press", entityId: body.entity_id as string });
          return respond(request, path, 200, [], safeBody);
        }
        if (request.method === "POST" && path.startsWith("/api/states/")) {
          const entityId = decodeURIComponent(path.slice("/api/states/".length));
          if (!LEGACY_SENSOR_ENTITY_IDS.has(entityId))
            return respond(request, path, 404, { error: "unknown sensor entity" });
          const body = await readObject(request);
          const result = legacySensorState(body, entityId);
          return respond(request, path, 200, result.response, result.safeBody);
        }
        return respond(request, path, 404, { error: "not found" });
      } catch (error) {
        if (error instanceof RequestError)
          return respond(request, path, error.status, { error: error.message });
        return respond(request, path, 500, { error: "internal mock server error" });
      }
    },
  });
  return {
    server,
    lights,
    serviceCalls,
    fail: (entityId, status) => { failures.set(entityId, status); },
  };
}

function portFromEnvironment(): number {
  const value = process.env.MOCK_HA_PORT ?? "18123";
  if (!/^\d+$/.test(value)) throw new Error("MOCK_HA_PORT must be an integer from 1 to 65535");
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error("MOCK_HA_PORT must be an integer from 1 to 65535");
  return port;
}

function main() {
  const token = process.env.MOCK_HA_TOKEN;
  if (!token) throw new Error("MOCK_HA_TOKEN is required");
  const mock = createMockHa({
    token,
    hostname: "0.0.0.0",
    port: portFromEnvironment(),
    quiet: false,
  });
  console.log(`mock-ha: listening on http://${mock.server.hostname}:${mock.server.port}`);
}

if (import.meta.main) {
  try { main(); }
  catch (error) {
    console.error(`mock-ha: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
