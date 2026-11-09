export type LightKind = "virtual" | "onboard" | "ha";
export type LightId = "desk" | "shelf" | "onboard" | "remote";

/** Display order everywhere: tiles, list rows, dimmer chips, swipe cycle. */
export const LIGHT_IDS: readonly LightId[] = ["desk", "shelf", "onboard", "remote"];

export interface LightState {
  on: boolean;
  /** 0..255, the Home Assistant brightness scale. */
  brightness: number;
  /** 0..359 degrees. */
  hue: number;
  /** 0..100 percent, the Home Assistant hs_color saturation scale. */
  saturation: number;
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
  haConfigured: boolean;
  haConnected: boolean;
  /** HA config names a light entity for the remote tile. */
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
  | { type: "clock"; clockEpochSeconds: number | null; clockSynced: boolean }
  | { type: "ha"; haConfigured: boolean; haConnected: boolean; haLightConfigured: boolean }
  | { type: "weather"; weather: Weather | null };

/** Brightness restored when a light at 0 is switched on. */
export const DEFAULT_ON_BRIGHTNESS = 128;

export function createInitialPanelState(): PanelState {
  return {
    lights: {
      desk: { on: true, brightness: 180, hue: 36, saturation: 70 },
      shelf: { on: false, brightness: 160, hue: 37, saturation: 12 },
      onboard: { on: false, brightness: 128, hue: 199, saturation: 68 },
      remote: { on: false, brightness: 128, hue: 36, saturation: 70 },
    },
    lightKinds: {
      desk: "virtual",
      shelf: "virtual",
      onboard: "onboard",
      remote: "ha",
    },
    haConfigured: false,
    haConnected: false,
    haLightConfigured: false,
    weather: null,
    clockEpochSeconds: null,
    clockSynced: false,
  };
}

/** The HA light only answers when HA is reachable and a light entity is configured. */
export function isLightAvailable(state: PanelState, lightId: LightId): boolean {
  if (state.lightKinds[lightId] !== "ha") return true;
  return state.haConnected && state.haLightConfigured;
}

export function availableLights(state: PanelState): LightId[] {
  return LIGHT_IDS.filter(lightId => isLightAvailable(state, lightId));
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
  for (const lightId of LIGHT_IDS) {
    const change = changes[lightId];
    if (!change) continue;
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

export function reducePanel(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "toggle-light":
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
    case "clock":
      if (state.clockEpochSeconds === action.clockEpochSeconds && state.clockSynced === action.clockSynced)
        return state;
      return { ...state, clockEpochSeconds: action.clockEpochSeconds, clockSynced: action.clockSynced };
    case "ha":
      if (state.haConfigured === action.haConfigured && state.haConnected === action.haConnected &&
          state.haLightConfigured === action.haLightConfigured)
        return state;
      return {
        ...state,
        haConfigured: action.haConfigured,
        haConnected: action.haConnected,
        haLightConfigured: action.haLightConfigured,
        // Weather is only shown while it is live.
        weather: action.haConnected ? state.weather : null,
      };
    case "weather":
      return sameWeather(state.weather, action.weather) ? state : { ...state, weather: action.weather };
  }
}

/** Lights whose state differs between two snapshots; drives the device adapters. */
export function changedLights(previous: PanelState, next: PanelState): LightId[] {
  if (previous.lights === next.lights) return [];
  return LIGHT_IDS.filter(lightId => !sameLight(previous.lights[lightId], next.lights[lightId]));
}
