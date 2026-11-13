import { abgr, hsvToRgb } from "./color";
import { pick, type Language } from "./i18n";
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

interface LightInfoEntry extends LightInfo {
  nameEn: string;
  chipEn: string;
  tagEn: string;
}

// Names are fixed rather than taken from HA's friendly_name: every CJK glyph
// the panel draws has to be baked into the font subset at build time.
export const LIGHT_INFO: Record<LightId, LightInfoEntry> = {
  desk: { name: "书桌灯", nameEn: "Desk Lamp", chip: "书桌灯", chipEn: "Desk", tag: "虚拟设备", tagEn: "Virtual" },
  shelf: { name: "书架灯", nameEn: "Shelf Lamp", chip: "书架灯", chipEn: "Shelf", tag: "虚拟设备", tagEn: "Virtual" },
  onboard: { name: "板载 RGB", nameEn: "Onboard RGB", chip: "板载", chipEn: "Onboard", tag: "板载 RGB", tagEn: "Onboard RGB" },
  remote: { name: "展厅主灯", nameEn: "Main Light", chip: "主灯", chipEn: "Main", tag: "Home Assistant", tagEn: "Home Assistant" },
};

/** Not-ready states render as LoadingDots, so they carry no text. */
export const UNAVAILABLE_TEXT = "";
export const PENDING_TEXT = "";

export function lightInfo(state: PanelState, lightId: LightId, language: Language = "zh"): LightInfo {
  const info = state.lightInfo[lightId];
  if (!info) return { name: lightId, chip: lightId, tag: "Home Assistant" };
  return language === "en"
    ? { name: info.nameEn, chip: info.chipEn, tag: info.tagEn }
    : { name: info.name, chip: info.chip, tag: info.tag };
}

export function lightStatusText(state: PanelState, lightId: LightId, language: Language = "zh"): string {
  const availability = state.lightAvailability[lightId];
  if (state.lightPending[lightId]) return pick(language, "更新中", "Updating");
  if (availability === "pending") return PENDING_TEXT;
  if (availability === "stale") return pick(language, "过期", "Stale");
  if (availability === "unavailable") return pick(language, "不可用", "Unavailable");
  if (state.lightErrors[lightId]) return pick(language, "更新失败", "Update failed");
  if (!isLightAvailable(state, lightId) && availability !== "read-only") return UNAVAILABLE_TEXT;
  const light = state.lights[lightId];
  const value = light.on
    ? pick(language, `开 ${percentFromBrightness(light.brightness)}%`, `On ${percentFromBrightness(light.brightness)}%`)
    : pick(language, "关", "Off");
  return availability === "read-only" ? `${value} · ${pick(language, "只读", "Read-only")}` : value;
}

/** The light's own color at full value, as a PocketJS ABGR color. */
export function lightColor(light: LightState): number {
  return abgr(hsvToRgb(light.hue, light.saturation / 100));
}

/** Bulb icon and chip coloring for a light: amber when lit warm, blue when lit cool. */
export type LightTone = "on" | "cool" | "off" | "unavailable";

export function lightTone(state: PanelState, lightId: LightId): LightTone {
  const availability = state.lightAvailability[lightId];
  if (availability === "pending" || availability === "offline" || availability === "unavailable") return "unavailable";
  const light = state.lights[lightId];
  if (!light.on) return "off";
  return light.hue >= 150 && light.hue <= 270 && light.saturation >= 30 ? "cool" : "on";
}
