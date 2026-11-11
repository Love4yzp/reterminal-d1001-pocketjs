import {
  assertShowroomConfig,
  SHOWROOM,
  SHOWROOM_LIGHT_IDS,
  type ActionRunStatus,
  type SensorReading,
  type ShowroomConfig,
} from "./showroom";

export type LightKind = "virtual" | "onboard" | "ha";
export type LightId = string;
export type LightAvailability = "available" | "offline" | "pending" | "read-only" | "stale" | "unavailable";

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
  colorTempKelvin?: number;
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
  lightPending: Record<LightId, boolean>;
  lightErrors: Record<LightId, string>;
  lightUpdatedAt: Record<LightId, number | null>;
  lightStaleAfter: Record<LightId, number>;
  legacyHaLightId: LightId | null;
  sensors: Record<string, SensorReading>;
  sensorOrder: string[];
  telemetryOrder: string[];
  sensorStaleAfter: Record<string, number>;
  sensorErrors: Record<string, string>;
  actionRuns: Record<string, ActionRunStatus>;
  actionErrors: Record<string, string>;
  haConfigured: boolean;
  haConnected: boolean;
  /** HA config names at least one light entity. */
  haLightConfigured: boolean;
  weather: Weather | null;
  clockEpochSeconds: number | null;
  clockSynced: boolean;
}

export type LightChanges = Partial<Record<LightId, Partial<LightState>>>;

export type PanelAction =
  | { type: "toggle-light"; lightId: LightId }
  | { type: "set-brightness"; lightId: LightId; brightness: number }
  | { type: "set-color"; lightId: LightId; hue: number; saturation: number; on?: boolean }
  | { type: "set-color-temp"; lightId: LightId; colorTempKelvin: number; on?: boolean }
  | { type: "set-lights"; changes: LightChanges }
  | { type: "remote-light"; light: LightState }
  | { type: "entity-light"; lightId: LightId; light: LightState; updatedAt?: number | null }
  | { type: "sensor"; sensorId: string; reading: SensorReading }
  | { type: "entity-error"; domain: "light" | "sensor"; key: string; availability: "offline" | "unavailable"; error: string }
  | { type: "sensor-tick"; nowSeconds: number | null }
  | { type: "action-result"; actionId: string; status: ActionRunStatus; error?: string }
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
  const lightPending: Record<LightId, boolean> = {};
  const lightUpdatedAt: Record<LightId, number | null> = {};
  const lightStaleAfter: Record<LightId, number> = {};
  let legacyHaLightId: string | null = null;
  for (const light of config.lights) {
    lights[light.key] = normalizeLight(light.initial);
    lightKinds[light.key] = light.source;
    lightInfo[light.key] = {
      name: light.name,
      chip: light.chip,
      tag: light.source === "ha" ? "Home Assistant" : light.source === "onboard" ? "板载 RGB" : "虚拟设备",
    };
    lightAvailability[light.key] = light.source !== "ha" ? "available" : "offline";
    lightPending[light.key] = false;
    lightUpdatedAt[light.key] = null;
    lightStaleAfter[light.key] = light.staleAfterSeconds ?? 90;
    if (light.legacy) legacyHaLightId = light.key;
  }
  const sensors: Record<string, SensorReading> = {};
  const sensorStaleAfter: Record<string, number> = {};
  for (const sensor of config.sensors) {
    sensors[sensor.key] = { value: null, status: "pending", updatedAt: null };
    sensorStaleAfter[sensor.key] = sensor.staleAfterSeconds;
  }
  const actionRuns: Record<string, ActionRunStatus> = {};
  for (const action of config.actions) actionRuns[action.key] = "idle";
  return {
    lights,
    lightKinds,
    lightOrder: config.lights.map(light => light.key),
    lightInfo,
    lightAvailability,
    lightPending,
    lightErrors: {},
    lightUpdatedAt,
    lightStaleAfter,
    legacyHaLightId,
    sensors,
    sensorOrder: config.sensors.filter(sensor => sensor.kind !== "telemetry").map(sensor => sensor.key),
    telemetryOrder: config.sensors.filter(sensor => sensor.kind === "telemetry").map(sensor => sensor.key),
    sensorStaleAfter,
    sensorErrors: {},
    actionRuns,
    actionErrors: {},
    haConfigured: false,
    haConnected: false,
    haLightConfigured: false,
    weather: null,
    clockEpochSeconds: null,
    clockSynced: false,
  };
}

export function isLightAvailable(state: PanelState, lightId: LightId): boolean {
  return state.lightAvailability[lightId] === "available" || state.lightAvailability[lightId] === "stale";
}

export function availableLights(state: PanelState): LightId[] {
  return state.lightOrder.filter(lightId => isLightAvailable(state, lightId));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeLight(light: LightState): LightState {
  const normalized: LightState = {
    on: light.on,
    brightness: clamp(light.brightness, 0, 255),
    hue: ((Math.round(light.hue) % 360) + 360) % 360,
    saturation: clamp(light.saturation, 0, 100),
  };
  if (typeof light.colorTempKelvin === "number" && Number.isFinite(light.colorTempKelvin))
    normalized.colorTempKelvin = clamp(light.colorTempKelvin, 1_000, 10_000);
  return normalized;
}

function sameLight(left: LightState, right: LightState): boolean {
  return left.on === right.on && left.brightness === right.brightness &&
    left.hue === right.hue && left.saturation === right.saturation &&
    left.colorTempKelvin === right.colorTempKelvin;
}

/** Merge a partial update; a light switched on at brightness 0 comes back at the default. */
function mergeLight(current: LightState, change: Partial<LightState>): LightState {
  const merged = { ...current, ...change };
  if (change.hue !== undefined || change.saturation !== undefined) delete merged.colorTempKelvin;
  const next = normalizeLight(merged);
  if (change.brightness !== undefined && change.on === undefined) next.on = next.brightness > 0;
  if (next.on && next.brightness === 0) next.brightness = DEFAULT_ON_BRIGHTNESS;
  return next;
}

function withLights(state: PanelState, changes: LightChanges, userAction: boolean): PanelState {
  let lights = state.lights;
  let lightPending = state.lightPending;
  let lightErrors = state.lightErrors;
  for (const lightId of state.lightOrder) {
    const change = changes[lightId];
    if (!change || !lights[lightId]) continue;
    if (userAction && !isLightAvailable(state, lightId)) continue;
    const next = mergeLight(lights[lightId], change);
    if (sameLight(next, lights[lightId])) continue;
    if (lights === state.lights) lights = { ...lights };
    lights[lightId] = next;
    if (userAction && state.lightKinds[lightId] === "ha") {
      if (lightPending === state.lightPending) lightPending = { ...lightPending };
      if (lightErrors === state.lightErrors) lightErrors = { ...lightErrors };
      lightPending[lightId] = true;
      delete lightErrors[lightId];
    }
  }
  return lights === state.lights ? state : { ...state, lights, lightPending, lightErrors };
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
        [action.lightId]: {
          hue: action.hue,
          saturation: action.saturation,
          ...(action.on === undefined ? {} : { on: action.on }),
        },
      }, true);
    case "set-color-temp":
      return withLights(state, {
        [action.lightId]: {
          colorTempKelvin: action.colorTempKelvin,
          ...(action.on === undefined ? {} : { on: action.on }),
        },
      }, true);
    case "set-lights":
      return withLights(state, action.changes, true);
    case "remote-light":
      return withLights(state, { remote: { ...action.light } }, false);
    case "entity-light": {
      if (!state.lights[action.lightId] || state.lightKinds[action.lightId] !== "ha") return state;
      const next = withLights(state, { [action.lightId]: { ...action.light } }, false);
      const availability: LightAvailability = state.haConnected ? "available" : "offline";
      const lightErrors = { ...state.lightErrors };
      delete lightErrors[action.lightId];
      return {
        ...next,
        lightAvailability: { ...next.lightAvailability, [action.lightId]: availability },
        lightPending: { ...next.lightPending, [action.lightId]: false },
        lightUpdatedAt: { ...next.lightUpdatedAt, [action.lightId]: action.updatedAt ?? null },
        lightErrors,
      };
    }
    case "sensor": {
      const current = state.sensors[action.sensorId];
      if (!current) return state;
      const reading = { ...action.reading };
      if (reading.status !== "live" && current.updatedAt !== null) {
        reading.value = reading.value ?? current.value;
        reading.updatedAt = current.updatedAt;
      }
      const sensorErrors = { ...state.sensorErrors };
      delete sensorErrors[action.sensorId];
      if (sameSensor(current, reading) && !(action.sensorId in state.sensorErrors)) return state;
      return { ...state, sensors: { ...state.sensors, [action.sensorId]: reading }, sensorErrors };
    }
    case "entity-error": {
      if (action.domain === "light") {
        if (state.lightKinds[action.key] !== "ha") return state;
        let availability = state.lightAvailability[action.key];
        if (action.availability === "unavailable") availability = "unavailable";
        else if (state.lightUpdatedAt[action.key] === null) availability = "offline";
        return {
          ...state,
          lightAvailability: { ...state.lightAvailability, [action.key]: availability },
          lightPending: { ...state.lightPending, [action.key]: false },
          lightErrors: { ...state.lightErrors, [action.key]: action.error },
        };
      }
      const current = state.sensors[action.key];
      if (!current) return state;
      const reading = { ...current };
      if (action.availability === "unavailable") reading.status = "unavailable";
      else if (current.status !== "live" && current.status !== "stale") reading.status = "offline";
      return {
        ...state,
        sensors: { ...state.sensors, [action.key]: reading },
        sensorErrors: { ...state.sensorErrors, [action.key]: action.error },
      };
    }
    case "sensor-tick": {
      if (action.nowSeconds === null) return state;
      let sensors = state.sensors;
      for (const sensorId of [...state.sensorOrder, ...state.telemetryOrder]) {
        const reading = sensors[sensorId]!;
        if (reading.status !== "live" || reading.updatedAt === null) continue;
        if (action.nowSeconds >= reading.updatedAt &&
            action.nowSeconds - reading.updatedAt > state.sensorStaleAfter[sensorId]!) {
          if (sensors === state.sensors) sensors = { ...sensors };
          sensors[sensorId] = { ...reading, status: "stale" };
        }
      }
      let lightAvailability = state.lightAvailability;
      for (const lightId of state.lightOrder) {
        const updatedAt = state.lightUpdatedAt[lightId];
        if (lightAvailability[lightId] !== "available" || updatedAt === null) continue;
        if (action.nowSeconds >= updatedAt &&
            action.nowSeconds - updatedAt > state.lightStaleAfter[lightId]!) {
          if (lightAvailability === state.lightAvailability)
            lightAvailability = { ...state.lightAvailability };
          lightAvailability[lightId] = "stale";
        }
      }
      const changed = sensors !== state.sensors || lightAvailability !== state.lightAvailability;
      return changed ? { ...state, sensors, lightAvailability } : state;
    }
    case "action-result": {
      if (!(action.actionId in state.actionRuns)) return state;
      const actionErrors = { ...state.actionErrors };
      if (action.status === "failed" && action.error) actionErrors[action.actionId] = action.error;
      else delete actionErrors[action.actionId];
      if (state.actionRuns[action.actionId] === action.status) return state;
      return {
        ...state,
        actionRuns: { ...state.actionRuns, [action.actionId]: action.status },
        actionErrors,
      };
    }
    case "clock":
      if (state.clockEpochSeconds === action.clockEpochSeconds && state.clockSynced === action.clockSynced)
        return state;
      return { ...state, clockEpochSeconds: action.clockEpochSeconds, clockSynced: action.clockSynced };
    case "ha": {
      if (state.haConfigured === action.haConfigured && state.haConnected === action.haConnected &&
          state.haLightConfigured === action.haLightConfigured)
        return state;
      const lightAvailability = { ...state.lightAvailability };
      const lightPending = { ...state.lightPending };
      for (const lightId of state.lightOrder) {
        if (state.lightKinds[lightId] !== "ha") continue;
        lightPending[lightId] = false;
        if (!action.haConnected || !action.haLightConfigured) lightAvailability[lightId] = "offline";
        else if (lightAvailability[lightId] === "offline") lightAvailability[lightId] = "pending";
      }
      const sensors = { ...state.sensors };
      for (const sensorId of [...state.sensorOrder, ...state.telemetryOrder]) {
        const reading = sensors[sensorId]!;
        if (!action.haConnected && (reading.status === "live" || reading.status === "stale"))
          sensors[sensorId] = { ...reading, status: "offline" };
        else if (action.haConnected && (reading.status === "offline" || reading.status === "stale"))
          sensors[sensorId] = { ...reading, status: "pending", value: null, updatedAt: null };
      }
      return {
        ...state,
        lightAvailability,
        lightPending,
        lightErrors: {},
        sensors,
        sensorErrors: {},
        haConfigured: action.haConfigured,
        haConnected: action.haConnected,
        haLightConfigured: action.haLightConfigured,
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
