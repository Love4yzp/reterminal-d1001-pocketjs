export type LightKind = "virtual" | "onboard" | "ha";
export type LightId = "desk" | "shelf" | "onboard" | "remote";

export interface LightState {
  on: boolean;
  brightness: number;
  hue: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface SensorSample {
  acceleration: Vector3;
  angularRate: Vector3;
  chipCelsius: number;
}

export interface PanelState {
  lights: Record<LightId, LightState>;
  lightKinds: Record<LightId, LightKind>;
  selected: LightId;
  haConfigured: boolean;
  haConnected: boolean;
  sensors: SensorSample | null;
  clockEpochSeconds: number | null;
  clockSynced: boolean;
}

export type PanelAction =
  | { type: "select-light"; lightId: LightId }
  | { type: "toggle-light"; lightId: LightId }
  | { type: "set-brightness"; lightId: LightId; brightness: number }
  | { type: "set-hue"; lightId: LightId; hue: number }
  | { type: "sensors"; sensors: SensorSample | null }
  | { type: "clock"; clockEpochSeconds: number | null; clockSynced: boolean }
  | { type: "ha"; haConfigured: boolean; haConnected: boolean };

export function createInitialPanelState(): PanelState {
  return {
    lights: {
      desk: { on: true, brightness: 180, hue: 40 },
      shelf: { on: false, brightness: 160, hue: 200 },
      onboard: { on: false, brightness: 128, hue: 210 },
      remote: { on: false, brightness: 128, hue: 0 },
    },
    lightKinds: {
      desk: "virtual",
      shelf: "virtual",
      onboard: "onboard",
      remote: "ha",
    },
    selected: "onboard",
    haConfigured: false,
    haConnected: false,
    sensors: null,
    clockEpochSeconds: null,
    clockSynced: false,
  };
}

function updateLight(state: PanelState, lightId: LightId, light: LightState): PanelState {
  if (state.lights[lightId] === light) return state;
  return { ...state, lights: { ...state.lights, [lightId]: light } };
}

function sameVector(left: Vector3, right: Vector3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function sameSensors(left: SensorSample | null, right: SensorSample | null): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return sameVector(left.acceleration, right.acceleration) &&
    sameVector(left.angularRate, right.angularRate) &&
    left.chipCelsius === right.chipCelsius;
}

export function reducePanel(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "select-light":
      return state.selected === action.lightId ? state : { ...state, selected: action.lightId };
    case "toggle-light": {
      const current = state.lights[action.lightId];
      return updateLight(state, action.lightId, { ...current, on: !current.on });
    }
    case "set-brightness": {
      const current = state.lights[action.lightId];
      const brightness = Math.min(255, Math.max(0, Math.round(action.brightness)));
      const on = brightness > 0;
      if (current.brightness === brightness && current.on === on) return state;
      return updateLight(state, action.lightId, { ...current, brightness, on });
    }
    case "set-hue": {
      const current = state.lights[action.lightId];
      const hue = ((Math.round(action.hue) % 360) + 360) % 360;
      if (current.hue === hue) return state;
      return updateLight(state, action.lightId, { ...current, hue });
    }
    case "sensors":
      return sameSensors(state.sensors, action.sensors) ? state : { ...state, sensors: action.sensors };
    case "clock":
      if (state.clockEpochSeconds === action.clockEpochSeconds && state.clockSynced === action.clockSynced)
        return state;
      return {
        ...state,
        clockEpochSeconds: action.clockEpochSeconds,
        clockSynced: action.clockSynced,
      };
    case "ha":
      if (state.haConfigured === action.haConfigured && state.haConnected === action.haConnected)
        return state;
      return { ...state, haConfigured: action.haConfigured, haConnected: action.haConnected };
  }
}
