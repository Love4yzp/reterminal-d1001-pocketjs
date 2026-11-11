import { LIGHT_IDS, type LightId, type LightState, type PanelState } from "./model";
import { INITIAL_ROUTE, type ProvisionTopic, type Route, type Tab } from "./navigation";
import { SHOWROOM_SENSOR_IDS } from "./showroom";
import {
  DEFAULT_SCREEN_OFF_SECONDS,
  SCREEN_OFF_OPTIONS,
  type SettingsState,
} from "./settings";

/** The part of the panel that survives an orientation restart. */
export interface SavedSession {
  version: 1;
  lights: Partial<Record<LightId, LightState>>;
  route: Route;
  settings: Pick<SettingsState, "screenOffSeconds">;
}

const TABS: readonly Tab[] = ["home", "lights", "sensors", "settings"];
const TOPICS: readonly ProvisionTopic[] = ["wifi", "ha"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

function isLightId(value: unknown): value is LightId {
  return typeof value === "string" && (LIGHT_IDS as readonly string[]).includes(value);
}

function isSensorId(value: unknown): value is string {
  return typeof value === "string" && (SHOWROOM_SENSOR_IDS as readonly string[]).includes(value);
}

function numberIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : null;
}

function readLight(value: unknown): LightState | null {
  if (!isRecord(value) || typeof value.on !== "boolean") return null;
  const brightness = numberIn(value.brightness, 0, 255);
  const hue = numberIn(value.hue, 0, 359);
  const saturation = numberIn(value.saturation, 0, 100);
  const colorTempKelvin = value.colorTempKelvin === undefined ? undefined : numberIn(value.colorTempKelvin, 1_000, 10_000);
  if (brightness === null || hue === null || saturation === null || colorTempKelvin === null) return null;
  return {
    on: value.on,
    brightness,
    hue,
    saturation,
    ...(colorTempKelvin === undefined ? {} : { colorTempKelvin }),
  };
}

function readRoute(value: unknown): Route {
  if (!isRecord(value)) return INITIAL_ROUTE;
  if (value.kind === "tab") return isTab(value.tab) ? { kind: "tab", tab: value.tab } : INITIAL_ROUTE;
  if (!isTab(value.from)) return INITIAL_ROUTE;
  if (value.kind === "dimmer" && isLightId(value.lightId))
    return { kind: "dimmer", lightId: value.lightId, from: value.from };
  if (value.kind === "sensor" && isSensorId(value.sensorId))
    return { kind: "sensor", sensorId: value.sensorId, from: value.from };
  if (value.kind === "arm") return { kind: "arm", from: value.from };
  if (value.kind === "provision" && typeof value.topic === "string" &&
      (TOPICS as readonly string[]).includes(value.topic))
    return { kind: "provision", topic: value.topic as ProvisionTopic, from: value.from };
  return INITIAL_ROUTE;
}

function readScreenOff(value: unknown): number {
  return typeof value === "number" &&
    SCREEN_OFF_OPTIONS.some(option => option.seconds === value)
    ? value
    : DEFAULT_SCREEN_OFF_SECONDS;
}

export function encodeSession(state: PanelState, route: Route, settings: SettingsState): string {
  return JSON.stringify({
    version: 1,
    lights: state.lights,
    route,
    settings: { screenOffSeconds: settings.screenOffSeconds },
  });
}

/** Parse a snapshot written by encodeSession; malformed values fall back safely. */
export function decodeSession(text: string): SavedSession | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null;
  const lights: Partial<Record<LightId, LightState>> = {};
  const rawLights = isRecord(parsed.lights) ? parsed.lights : {};
  for (const lightId of LIGHT_IDS) {
    const light = readLight(rawLights[lightId]);
    if (light) lights[lightId] = light;
  }
  const rawSettings = isRecord(parsed.settings) ? parsed.settings : {};
  return {
    version: 1,
    lights,
    route: readRoute(parsed.route),
    settings: { screenOffSeconds: readScreenOff(rawSettings.screenOffSeconds) },
  };
}

export function restorePanelState(base: PanelState, session: SavedSession): PanelState {
  const lights = { ...base.lights };
  for (const lightId of base.lightOrder) {
    const light = session.lights[lightId];
    if (light) lights[lightId] = light;
  }
  return { ...base, lights };
}

export function restoreSettings(base: SettingsState, session: SavedSession): SettingsState {
  return { ...base, screenOffSeconds: session.settings.screenOffSeconds };
}
