import { hsvToRgb } from "../apps/showroom-ha-panel/color";
import { hueFromX, saturationFromX } from "../apps/showroom-ha-panel/dimmer";
import type { HaLightCommand } from "../apps/showroom-ha-panel/ha-request";
import type { WorkerCommand } from "../apps/showroom-ha-panel/protocol";
import { gestures, type NativeCalls, type Shot } from "./showroom-ha-panel-preview.ts";

const { tap, hold, drag } = gestures;

interface ShotSet {
  connected: Shot[];
  offline: Shot[];
  noWeather: Shot[];
  arm: Shot[];
}

function verifyAction(actionId: string, confirmed: boolean) {
  return (commands: readonly WorkerCommand[]) => {
    const matches = commands.filter(command => command.type === "action" && command.actionId === actionId);
    if (matches.length !== 1 || matches[0]?.confirmed !== confirmed)
      throw new Error(`expected one ${actionId} action with confirmed=${confirmed}; got ${JSON.stringify(matches)}`);
  };
}

function verifyNoArm(commands: readonly WorkerCommand[]) {
  const matches = commands.filter(command => command.type === "action" && command.actionId.startsWith("arm-"));
  if (matches.length) throw new Error(`unconfigured arm action sent ${JSON.stringify(matches)}`);
}

function verifyOnePresetSwitch(_commands: readonly WorkerCommand[], native: NativeCalls) {
  const count = native.presetSwitches();
  if (count !== 1) throw new Error(`expected one next-preset request; got ${count}`);
}

function verifyLight(lightId: string, expected: HaLightCommand) {
  return (commands: readonly WorkerCommand[]) => {
    const matches = commands.filter(command => command.type === "entity-light" && command.lightId === lightId);
    if (matches.length !== 1 || JSON.stringify(matches[0]?.command) !== JSON.stringify(expected))
      throw new Error(`expected ${lightId} ${JSON.stringify(expected)}; got ${JSON.stringify(matches)}`);
  };
}

// The last command for the light must turn it on with the RGB of the hue and
// saturation under the finger at the end of the two drags; no turn_off follows.
function verifyColor(lightId: string, hue: number, saturation: number) {
  return (commands: readonly WorkerCommand[]) => {
    const matches = commands.filter(command => command.type === "entity-light" && command.lightId === lightId);
    const last = matches.at(-1);
    const expected = hsvToRgb(hue, saturation / 100);
    if (!last || last.type !== "entity-light" || last.command?.on !== true ||
        JSON.stringify(last.command?.rgbColor) !== JSON.stringify(expected))
      throw new Error(`expected ${lightId} on with rgb ${JSON.stringify(expected)}; got ${JSON.stringify(matches)}`);
  };
}

export const SHOTS: ShotSet = {
  connected: [
    { name: "home", tape: [] },
    { name: "home-toggle", tape: tap(100, 140), verify: verifyLight("remote", { on: true }) },
    { name: "reachy-retail", tape: tap(75, 322), verify: verifyAction("reachy-intro-retail", false) },
    { name: "reachy-stop", tape: tap(327, 374), verify: verifyAction("reachy-stop", false) },
    { name: "arm-unconfigured", tape: [...tap(100, 450), ...tap(110, 330)], verify: verifyNoArm },
    { name: "lights", tape: tap(150, 610) },
    { name: "sensors", tape: tap(250, 610) },
    { name: "sensor-detail", tape: [...tap(250, 610), ...tap(100, 160)] },
    { name: "dimmer", tape: hold(100, 140) },
    { name: "dimmer-drag", tape: [...hold(100, 140), ...drag(200, 390, 200, 270)] },
    {
      name: "dimmer-color",
      tape: [...hold(100, 140), ...tap(328, 322), ...drag(100, 494, 230, 494), ...drag(300, 546, 157, 546)],
      verify: verifyColor("remote", hueFromX(230, 84, 292), saturationFromX(157, 84, 292)),
    },
    { name: "settings", tape: tap(350, 610) },
    { name: "settings-timeout", tape: [...tap(350, 610), ...tap(242, 199)] },
    { name: "settings-backlight", tape: [...tap(350, 610), ...drag(240, 100, 330, 100)] },
    { name: "provision", tape: [...tap(350, 610), ...tap(100, 296)] },
    { name: "provision-switch", tape: [...tap(350, 610), ...tap(100, 296), ...tap(200, 436)], verify: verifyOnePresetSwitch },
  ],
  offline: [
    { name: "home", tape: [] },
    { name: "lights", tape: tap(150, 610) },
    { name: "sensors", tape: tap(250, 610) },
    { name: "settings", tape: tap(350, 610) },
  ],
  noWeather: [
    { name: "home", tape: [] },
  ],
  arm: [
    { name: "arm-hold-confirm", tape: [...tap(100, 450), ...tap(110, 330), ...hold(110, 330)], verify: verifyAction("arm-gravity", true) },
  ],
};

export const LANDSCAPE_SHOTS: ShotSet = {
  connected: [
    { name: "home", tape: [] },
    { name: "home-toggle", tape: tap(160, 140), verify: verifyLight("remote", { on: true }) },
    { name: "reachy-retail", tape: tap(150, 325), verify: verifyAction("reachy-intro-retail", false) },
    { name: "reachy-stop", tape: tap(350, 371), verify: verifyAction("reachy-stop", false) },
    { name: "arm-unconfigured", tape: [...tap(500, 300), ...tap(400, 150)], verify: verifyNoArm },
    { name: "lights", tape: tap(44, 155) },
    { name: "sensors", tape: tap(44, 230) },
    { name: "sensor-detail", tape: [...tap(44, 230), ...tap(150, 150)] },
    { name: "dimmer", tape: hold(160, 140) },
    { name: "dimmer-drag", tape: [...hold(160, 140), ...drag(240, 340, 240, 200)] },
    {
      name: "dimmer-color",
      tape: [...hold(160, 140), ...tap(480, 230), ...drag(400, 290, 504, 290), ...drag(600, 338, 445, 338)],
      verify: verifyColor("remote", hueFromX(504, 386, 236), saturationFromX(445, 386, 236)),
    },
    { name: "settings", tape: tap(44, 315) },
    { name: "settings-timeout", tape: [...tap(44, 315), ...tap(170, 240)] },
    { name: "settings-backlight", tape: [...tap(44, 315), ...drag(240, 85, 330, 85)] },
    { name: "settings-rotate", tape: [...tap(44, 315), ...tap(500, 344)] },
    { name: "provision", tape: [...tap(44, 315), ...tap(450, 90)] },
    { name: "provision-switch", tape: [...tap(44, 315), ...tap(450, 90), ...tap(164, 276)], verify: verifyOnePresetSwitch },
  ],
  offline: [
    { name: "home", tape: [] },
    { name: "lights", tape: tap(44, 155) },
    { name: "sensors", tape: tap(44, 230) },
    { name: "settings", tape: tap(44, 315) },
  ],
  noWeather: [
    { name: "home", tape: [] },
  ],
  arm: [
    { name: "arm-hold-confirm", tape: [...tap(500, 300), ...tap(400, 150), ...hold(400, 150)], verify: verifyAction("arm-gravity", true) },
  ],
};
