import { abgr, hsvToRgb } from "./color";
import { isLightAvailable, type LightId, type LightState, type PanelState } from "./model";
import { percentFromBrightness } from "./dimmer";

export interface LightInfo {
  /** Full name: tiles, list rows, dimmer title. */
  name: string;
  /** Short name for the dimmer chips. */
  chip: string;
  /** Source tag in the dimmer header. */
  tag: string;
}

// Names are fixed rather than taken from HA's friendly_name: every CJK glyph
// the panel draws has to be baked into the font subset at build time.
export const LIGHT_INFO: Record<LightId, LightInfo> = {
  desk: { name: "书桌灯", chip: "书桌灯", tag: "虚拟设备" },
  shelf: { name: "书架灯", chip: "书架灯", tag: "虚拟设备" },
  onboard: { name: "板载 RGB", chip: "板载", tag: "板载 RGB" },
  remote: { name: "客厅灯", chip: "客厅", tag: "Home Assistant" },
};

export const UNAVAILABLE_TEXT = "未连接 HA";
export const PENDING_TEXT = "待接入";

export function lightInfo(state: PanelState, lightId: LightId): LightInfo {
  return state.lightInfo[lightId] ?? { name: lightId, chip: lightId, tag: "Home Assistant" };
}

export function lightStatusText(state: PanelState, lightId: LightId): string {
  const availability = state.lightAvailability[lightId];
  if (availability === "pending") return PENDING_TEXT;
  if (!isLightAvailable(state, lightId) && availability !== "read-only") return UNAVAILABLE_TEXT;
  const light = state.lights[lightId];
  const value = light.on ? `开 ${percentFromBrightness(light.brightness)}%` : "关";
  return availability === "read-only" ? `${value} · 只读` : value;
}

/** The light's own color at full value, as a PocketJS ABGR color. */
export function lightColor(light: LightState): number {
  return abgr(hsvToRgb(light.hue, light.saturation / 100));
}

/** Bulb icon and chip coloring for a light: amber when lit warm, blue when lit cool. */
export type LightTone = "on" | "cool" | "off" | "unavailable";

export function lightTone(state: PanelState, lightId: LightId): LightTone {
  const availability = state.lightAvailability[lightId];
  if (availability === "pending" || availability === "offline") return "unavailable";
  const light = state.lights[lightId];
  if (!light.on) return "off";
  return light.hue >= 150 && light.hue <= 270 && light.saturation >= 30 ? "cool" : "on";
}
