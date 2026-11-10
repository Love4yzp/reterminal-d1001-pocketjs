import {
  assertShowroomConfig,
  SHOWROOM,
  SHOWROOM_LIGHT_IDS,
  type SceneRunStatus,
  type SensorReading,
  type ShowroomConfig,
} from "./showroom";

export type LightKind = "virtual" | "onboard" | "ha";
export type LightId = string;
export type LightAvailability = "available" | "offline" | "pending" | "read-only";

/** Default example order; each runtime state also carries its configured order. */
export const LIGHT_IDS: readonly LightId[] = SHOWROOM_LIGHT_IDS;

export interface LightState {
  on: boolean;
  /** 0..255, the Home Assistant brightness scale. */
  brightness: number;
  /** 0..359 degrees. */
  hue: number;
  /** 0..100 percent, the Home Assistant hs_color saturation scale. */
  saturation: number;
}

export interface LightPresentation {
  name: string;
  chip: string;
  tag: string;
}

/** A Home Assistant weather entity as read from the instance; never invented. */
export interface Weather {
  entityId: string;
  /** HA condition string such as "partlycloudy" or "rainy". */
  condition: string;
  temperature: number | null;
  unit: string;
}

export interface PanelState {
  lights: Record<LightId, LightState>;
  lightKinds: Record<LightId, LightKind>;
  lightOrder: LightId[];
  lightInfo: Record<LightId, LightPresentation>;
  lightAvailability: Record<LightId, LightAvailability>;
  legacyHaLightId: LightId | null;
  sensors: Record<string, SensorReading>;
  sensorOrder: string[];
  sensorStaleAfter: Record<string, number>;
  sceneRuns: Record<string, SceneRunStatus>;
  haConfigured: boolean;
  haConnected: boolean;
  /** HA config names a light entity for the legacy remote tile. */
  haLightConfigured: boolean;
  weather: Weather | null;
  clockEpochSeconds: number | null;
  clockSynced: boolean;
}

export type LightChanges = Partial<Record<LightId, Partial<LightState>>>;

export type PanelAction =
  | { type: "toggle-light"; lightId: LightId }
  | { type: "set-brightness"; lightId: LightId; brightness: number }
  | { type: "set-color"; lightId: LightId; hue: number; saturation: number }
  | { type: "set-lights"; changes: LightChanges }
  | { type: "remote-light"; light: LightState }
  | { type: "entity-light"; lightId: LightId; light: LightState }
  | { type: "sensor"; sensorId: string; reading: SensorReading }
  | { type: "sensor-tick"; nowSeconds: number | null }
  | { type: "scene-result"; sceneId: string; status: SceneRunStatus }
  | { type: "clock"; clockEpochSeconds: number | null; clockSynced: boolean }
  | { type: "ha"; haConfigured: boolean; haConnected: boolean; haLightConfigured: boolean }
  | { type: "weather"; weather: Weather | null };

/** Brightness restored when a light at 0 is switched on. */
export const DEFAULT_ON_BRIGHTNESS = 128;

export function createInitialPanelState(config: ShowroomConfig = SHOWROOM): PanelState {
  assertShowroomConfig(config);
  const lights: Record<LightId, LightState> = {};
  const lightKinds: Record<LightId, LightKind> = {};
  const lightInfo: Record<LightId, LightPresentation> = {};
  const lightAvailability: Record<LightId, LightAvailability> = {};
  let legacyHaLightId: string | null = null;
  for (const light of config.lights) {
    lights[light.key] = normalizeLight(light.initial);
    lightKinds[light.key] = light.source;
    lightInfo[light.key] = {
      name: light.name,
      chip: light.chip,
      tag: light.source === "ha" ? "Home Assistant" : light.source === "onboard" ? "板载 RGB" : "虚拟设备",
    };
    lightAvailability[light.key] = light.source !== "ha" ? "available" : light.legacy ? "offline" : "pending";
    if (light.legacy) legacyHaLightId = light.key;
  }
  const sensors: Record<string, SensorReading> = {};
  const sensorStaleAfter: Record<string, number> = {};
  for (const sensor of config.sensors) {
    sensors[sensor.key] = { value: null, status: "pending", updatedAt: null };
    sensorStaleAfter[sensor.key] = sensor.staleAfterSeconds;
  }
  const sceneRuns: Record<string, SceneRunStatus> = {};
  for (const scene of config.scenes) sceneRuns[scene.key] = "idle";
  return {
    lights,
    lightKinds,
    lightOrder: config.lights.map(light => light.key),
    lightInfo,
    lightAvailability,
    legacyHaLightId,
    sensors,
    sensorOrder: config.sensors.map(sensor => sensor.key),
    sensorStaleAfter,
    sceneRuns,
    haConfigured: false,
    haConnected: false,
    haLightConfigured: false,
    weather: null,
    clockEpochSeconds: null,
    clockSynced: false,
  };
}

export function isLightAvailable(state: PanelState, lightId: LightId): boolean {
  return state.lightAvailability[lightId] === "available";
}

export function availableLights(state: PanelState): LightId[] {
  return state.lightOrder.filter(lightId => isLightAvailable(state, lightId));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeLight(light: LightState): LightState {
  return {
    on: light.on,
    brightness: clamp(light.brightness, 0, 255),
    hue: ((Math.round(light.hue) % 360) + 360) % 360,
    saturation: clamp(light.saturation, 0, 100),
  };
}

function sameLight(left: LightState, right: LightState): boolean {
  return left.on === right.on && left.brightness === right.brightness &&
    left.hue === right.hue && left.saturation === right.saturation;
}

/** Merge a partial update; a light switched on at brightness 0 comes back at the default. */
function mergeLight(current: LightState, change: Partial<LightState>): LightState {
  const next = normalizeLight({ ...current, ...change });
  if (change.brightness !== undefined && change.on === undefined) next.on = next.brightness > 0;
  if (next.on && next.brightness === 0) next.brightness = DEFAULT_ON_BRIGHTNESS;
  return next;
}

function withLights(state: PanelState, changes: LightChanges, userAction: boolean): PanelState {
  let lights = state.lights;
  for (const lightId of state.lightOrder) {
    const change = changes[lightId];
    if (!change || !lights[lightId]) continue;
    if (userAction && !isLightAvailable(state, lightId)) continue;
    const next = mergeLight(lights[lightId], change);
    if (sameLight(next, lights[lightId])) continue;
    if (lights === state.lights) lights = { ...lights };
    lights[lightId] = next;
  }
  return lights === state.lights ? state : { ...state, lights };
}

function sameWeather(left: Weather | null, right: Weather | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.entityId === right.entityId && left.condition === right.condition &&
    left.temperature === right.temperature && left.unit === right.unit;
}

function sameSensor(left: SensorReading, right: SensorReading): boolean {
  return left.value === right.value && left.status === right.status && left.updatedAt === right.updatedAt;
}

export function reducePanel(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "toggle-light":
      if (!state.lights[action.lightId]) return state;
      return withLights(state, { [action.lightId]: { on: !state.lights[action.lightId].on } }, true);
    case "set-brightness":
      return withLights(state, { [action.lightId]: { brightness: action.brightness } }, true);
    case "set-color":
      return withLights(state, {
        [action.lightId]: { hue: action.hue, saturation: action.saturation },
      }, true);
    case "set-lights":
      return withLights(state, action.changes, true);
    case "remote-light":
      return withLights(state, { remote: { ...action.light } }, false);
    case "entity-light": {
      if (!state.lights[action.lightId] || state.lightKinds[action.lightId] !== "ha") return state;
      const next = withLights(state, { [action.lightId]: { ...action.light } }, false);
      const availability: LightAvailability = !state.haConnected
        ? "offline"
        : action.lightId === state.legacyHaLightId && state.haLightConfigured
          ? "available"
          : "read-only";
      if (state.lightAvailability[action.lightId] === availability) return next;
      return {
        ...next,
        lightAvailability: { ...next.lightAvailability, [action.lightId]: availability },
      };
    }
    case "sensor": {
      const current = state.sensors[action.sensorId];
      if (!current || sameSensor(current, action.reading)) return state;
      return { ...state, sensors: { ...state.sensors, [action.sensorId]: { ...action.reading } } };
    }
    case "sensor-tick": {
      if (action.nowSeconds === null) return state;
      let sensors = state.sensors;
      for (const sensorId of state.sensorOrder) {
        const reading = sensors[sensorId]!;
        if (reading.status !== "live" || reading.updatedAt === null) continue;
        if (action.nowSeconds >= reading.updatedAt &&
            action.nowSeconds - reading.updatedAt > state.sensorStaleAfter[sensorId]!) {
          if (sensors === state.sensors) sensors = { ...state.sensors };
          sensors[sensorId] = { ...reading, status: "stale" };
        }
      }
      return sensors === state.sensors ? state : { ...state, sensors };
    }
    case "scene-result":
      if (!(action.sceneId in state.sceneRuns) || state.sceneRuns[action.sceneId] === action.status) return state;
      return { ...state, sceneRuns: { ...state.sceneRuns, [action.sceneId]: action.status } };
    case "clock":
      if (state.clockEpochSeconds === action.clockEpochSeconds && state.clockSynced === action.clockSynced)
        return state;
      return { ...state, clockEpochSeconds: action.clockEpochSeconds, clockSynced: action.clockSynced };
    case "ha": {
      if (state.haConfigured === action.haConfigured && state.haConnected === action.haConnected &&
          state.haLightConfigured === action.haLightConfigured)
        return state;
      const lightAvailability = { ...state.lightAvailability };
      for (const lightId of state.lightOrder) {
        if (state.lightKinds[lightId] !== "ha") continue;
        if (lightId === state.legacyHaLightId)
          lightAvailability[lightId] = action.haConnected && action.haLightConfigured ? "available" : "offline";
        else if (!action.haConnected && lightAvailability[lightId] !== "pending")
          lightAvailability[lightId] = "offline";
        else if (action.haConnected && lightAvailability[lightId] === "offline")
          lightAvailability[lightId] = "pending";
      }
      const sensors = { ...state.sensors };
      for (const sensorId of state.sensorOrder) {
        const reading = sensors[sensorId]!;
        if (!action.haConnected && (reading.status === "live" || reading.status === "stale"))
          sensors[sensorId] = { ...reading, status: "offline" };
        else if (action.haConnected && (reading.status === "offline" || reading.status === "stale"))
          sensors[sensorId] = { ...reading, status: "pending", value: null, updatedAt: null };
      }
      return {
        ...state,
        lightAvailability,
        sensors,
        haConfigured: action.haConfigured,
        haConnected: action.haConnected,
        haLightConfigured: action.haLightConfigured,
        // Weather is only shown while it is live.
        weather: action.haConnected ? state.weather : null,
      };
    }
    case "weather":
      return sameWeather(state.weather, action.weather) ? state : { ...state, weather: action.weather };
  }
}

/** Lights whose state differs between two snapshots; drives the device adapters. */
export function changedLights(previous: PanelState, next: PanelState): LightId[] {
  if (previous.lights === next.lights) return [];
  return previous.lightOrder.filter(lightId => !sameLight(previous.lights[lightId], next.lights[lightId]));
}
