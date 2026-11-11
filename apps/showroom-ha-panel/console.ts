import { hsvToRgb } from "./color";
import { percentFromBrightness } from "./dimmer";
import type { HaLightCommand } from "./ha-request";
import type { LightState, PanelAction } from "./model";
import type { PanelHaConfig } from "./protocol";
import { showroomAction } from "./showroom";

export function lightStateCommand(light: LightState): HaLightCommand {
  if (!light.on) return { on: false };
  return {
    on: true,
    brightnessPct: percentFromBrightness(light.brightness),
    ...(light.colorTempKelvin !== undefined
      ? { colorTempKelvin: light.colorTempKelvin }
      : { rgbColor: hsvToRgb(light.hue, light.saturation / 100) }),
  };
}

export function lightCommandForAction(action: PanelAction, light: LightState): HaLightCommand | undefined {
  switch (action.type) {
    case "toggle-light": return { on: light.on };
    case "set-brightness":
      return light.on ? { on: true, brightnessPct: percentFromBrightness(light.brightness) } : { on: false };
    case "set-color":
      return { on: light.on, rgbColor: hsvToRgb(light.hue, light.saturation / 100) };
    case "set-color-temp":
      return light.colorTempKelvin === undefined
        ? undefined
        : { on: light.on, colorTempKelvin: light.colorTempKelvin };
    case "set-lights": return lightStateCommand(light);
    default: return undefined;
  }
}

export function mergeLightCommands(
  previous: HaLightCommand | undefined,
  next: HaLightCommand | undefined,
): HaLightCommand | undefined {
  if (!previous || !next) return next;
  const merged: HaLightCommand = { on: next.on };
  const brightnessPct = next.brightnessPct ?? previous.brightnessPct;
  if (brightnessPct !== undefined) merged.brightnessPct = brightnessPct;
  if (next.colorTempKelvin !== undefined) merged.colorTempKelvin = next.colorTempKelvin;
  else if (next.rgbColor !== undefined) merged.rgbColor = next.rgbColor;
  else if (previous.colorTempKelvin !== undefined) merged.colorTempKelvin = previous.colorTempKelvin;
  else if (previous.rgbColor !== undefined) merged.rgbColor = previous.rgbColor;
  return merged;
}

/** HA script every arm action dispatches through; its KeyMesh parameters are fixed in ha-request. */
export const ARM_SCRIPT_ENTITY_ID = "script.keymesh_dispatch";

/** The entity an action calls: arm actions are fixed, Reachy actions come from the device entity map. */
export function actionEntityId(config: Pick<PanelHaConfig, "entityMap">, actionId: string): string | undefined {
  if (showroomAction(actionId)?.group === "arm") return ARM_SCRIPT_ENTITY_ID;
  return config.entityMap?.actions[actionId];
}

export function actionConfigured(config: Pick<PanelHaConfig, "entityMap">, actionId: string): boolean {
  return Boolean(actionEntityId(config, actionId));
}
