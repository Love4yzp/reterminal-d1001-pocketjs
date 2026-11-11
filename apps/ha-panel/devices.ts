import { applyBrightness, hsvToRgb } from "./color";
import type { HaLightCommand } from "./ha-request";
import type { LightId, LightKind, LightState } from "./model";
import { setNativeRgb } from "./native";

export interface LightAdapter {
  apply(light: LightState, command?: HaLightCommand): void;
}

/** Where a light's state goes: nowhere (virtual), the onboard RGB, or HA. */
export function createLightAdapter(
  lightId: LightId,
  kind: LightKind,
  sendHa: (light: LightState, command?: HaLightCommand) => void,
): LightAdapter {
  return {
    apply(light: LightState, command?: HaLightCommand): void {
      if (kind === "onboard") {
        const color = applyBrightness(hsvToRgb(light.hue, light.saturation / 100), light.on ? light.brightness : 0);
        if (!setNativeRgb(color)) throw new Error("onboard RGB write failed");
      } else if (kind === "ha") {
        sendHa(light, command);
      }
      console.log(`[ha-panel] light=${lightId} kind=${kind} on=${light.on} brightness=${light.brightness} hue=${light.hue} sat=${light.saturation}`);
    },
  };
}
