import { createHash, timingSafeEqual } from "node:crypto";

const LIGHT_ENTITY_ID = "light.mock_lamp";
const SENSOR_ENTITY_IDS = new Set([
  "sensor.d1001_accel_x",
  "sensor.d1001_accel_y",
  "sensor.d1001_accel_z",
  "sensor.d1001_gyro_x",
  "sensor.d1001_gyro_y",
  "sensor.d1001_gyro_z",
  "sensor.d1001_chip_temperature",
]);

type JsonObject = Record<string, unknown>;
type SafeBody = Record<string, unknown>;

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RequestError";
  }
}

const lamp = {
  on: false,
  brightness: 128,
  rgbColor: [255, 255, 255] as [number, number, number],
  lastChanged: new Date().toISOString(),
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function isRgb(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isByte);
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

function respond(
  request: Request,
  path: string,
  status: number,
  value: unknown,
  safeBody?: SafeBody,
): Response {
  console.log(JSON.stringify({ method: request.method, path, status, body: safeBody }));
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
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

function lightState() {
  return {
    entity_id: LIGHT_ENTITY_ID,
    state: lamp.on ? "on" : "off",
    attributes: {
      friendly_name: "Mock Lamp",
      brightness: lamp.brightness,
      rgb_color: lamp.rgbColor,
      color_mode: "rgb",
      supported_color_modes: ["rgb"],
      supported_features: 0,
    },
    last_changed: lamp.lastChanged,
    last_updated: new Date().toISOString(),
    context: context(),
  };
}

function updateLight(body: JsonObject, turnOn: boolean): SafeBody {
  if (body.entity_id !== LIGHT_ENTITY_ID)
    throw new RequestError(400, "entity_id must be light.mock_lamp");
  if (turnOn && body.brightness !== undefined && !isByte(body.brightness))
    throw new RequestError(400, "brightness must be an integer from 0 to 255");
  if (turnOn && body.rgb_color !== undefined && !isRgb(body.rgb_color))
    throw new RequestError(400, "rgb_color must contain three integers from 0 to 255");

  if (turnOn) {
    lamp.on = true;
    if (body.brightness !== undefined) lamp.brightness = body.brightness as number;
    if (body.rgb_color !== undefined) lamp.rgbColor = body.rgb_color as [number, number, number];
  } else {
    lamp.on = false;
  }
  lamp.lastChanged = new Date().toISOString();

  const safeBody: SafeBody = { entity_id: LIGHT_ENTITY_ID };
  if (turnOn && body.brightness !== undefined) safeBody.brightness = body.brightness;
  if (turnOn && body.rgb_color !== undefined) safeBody.rgb_color = body.rgb_color;
  return safeBody;
}

function sensorState(body: JsonObject, entityId: string) {
  if (typeof body.state !== "number" || !Number.isFinite(body.state))
    throw new RequestError(400, "sensor state must be a finite number");
  if (!isObject(body.attributes))
    throw new RequestError(400, "sensor attributes must be an object");
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
  const now = new Date().toISOString();
  return {
    response: {
      entity_id: entityId,
      state: String(body.state),
      attributes: safeAttributes,
      last_changed: now,
      last_updated: now,
      context: context(),
    },
    safeBody: { state: body.state, attributes: safeAttributes },
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
  const port = portFromEnvironment();
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (!authorized(request, token))
        return respond(request, path, 401, { error: "unauthorized" });

      try {
        if (request.method === "GET" && path === `/api/states/${LIGHT_ENTITY_ID}`)
          return respond(request, path, 200, lightState());

        if (request.method === "POST" &&
          (path === "/api/services/light/turn_on" || path === "/api/services/light/turn_off")) {
          const body = await readObject(request);
          const turnOn = path.endsWith("/turn_on");
          const safeBody = updateLight(body, turnOn);
          return respond(request, path, 200, [lightState()], safeBody);
        }

        if (request.method === "POST" && path.startsWith("/api/states/")) {
          const entityId = path.slice("/api/states/".length);
          if (!SENSOR_ENTITY_IDS.has(entityId))
            return respond(request, path, 404, { error: "unknown sensor entity" });
          const body = await readObject(request);
          const result = sensorState(body, entityId);
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
  console.log(`mock-ha: listening on http://${server.hostname}:${server.port}`);
}

try { main(); }
catch (error) {
  console.error(`mock-ha: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
