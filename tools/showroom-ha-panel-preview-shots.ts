import type { HaLightCommand } from "../apps/showroom-ha-panel/ha-request";
import type { WorkerCommand } from "../apps/showroom-ha-panel/protocol";
import { gestures, type Shot } from "./showroom-ha-panel-preview.ts";

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

function verifyLight(lightId: string, expected: HaLightCommand) {
  return (commands: readonly WorkerCommand[]) => {
    const matches = commands.filter(command => command.type === "entity-light" && command.lightId === lightId);
    if (matches.length !== 1 || JSON.stringify(matches[0]?.command) !== JSON.stringify(expected))
      throw new Error(`expected ${lightId} ${JSON.stringify(expected)}; got ${JSON.stringify(matches)}`);
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
    { name: "lights-switch", tape: [...tap(150, 610), ...tap(290, 160)] },
    { name: "lights-row", tape: [...tap(150, 610), ...tap(100, 160)] },
    { name: "sensors", tape: tap(250, 610) },
    { name: "sensor-detail", tape: [...tap(250, 610), ...tap(100, 160)] },
    { name: "dimmer", tape: hold(100, 140) },
    { name: "dimmer-drag", tape: [...hold(100, 140), ...drag(200, 390, 200, 270)] },
    { name: "dimmer-swipe", tape: [...hold(100, 140), ...drag(330, 450, 90, 450)] },
    { name: "dimmer-preset", tape: [...hold(100, 140), ...tap(262, 500)] },
    { name: "settings", tape: tap(350, 610) },
    { name: "settings-timeout", tape: [...tap(350, 610), ...tap(242, 199)] },
    { name: "settings-backlight", tape: [...tap(350, 610), ...drag(240, 100, 330, 100)] },
    { name: "provision", tape: [...tap(350, 610), ...tap(100, 296)] },
  ],
  offline: [
    { name: "home", tape: [] },
    { name: "lights", tape: tap(150, 610) },
    { name: "sensors", tape: tap(250, 610) },
    { name: "dimmer", tape: [...tap(150, 610), ...hold(100, 160)] },
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
    { name: "reachy-retail", tape: tap(459, 106), verify: verifyAction("reachy-intro-retail", false) },
    { name: "reachy-stop", tape: tap(559, 210), verify: verifyAction("reachy-stop", false) },
    { name: "arm-unconfigured", tape: [...tap(450, 300), ...tap(400, 150)], verify: verifyNoArm },
    { name: "lights", tape: tap(44, 155) },
    { name: "lights-switch", tape: [...tap(44, 155), ...tap(300, 155)] },
    { name: "lights-row", tape: [...tap(44, 155), ...tap(150, 150)] },
    { name: "sensors", tape: tap(44, 230) },
    { name: "sensor-detail", tape: [...tap(44, 230), ...tap(150, 150)] },
    { name: "dimmer", tape: hold(160, 140) },
    { name: "dimmer-drag", tape: [...hold(160, 140), ...drag(240, 340, 240, 200)] },
    { name: "dimmer-swipe", tape: [...hold(160, 140), ...drag(500, 250, 100, 250)] },
    { name: "dimmer-preset", tape: [...hold(160, 140), ...tap(494, 342)] },
    { name: "settings", tape: tap(44, 315) },
    { name: "settings-timeout", tape: [...tap(44, 315), ...tap(170, 240)] },
    { name: "settings-backlight", tape: [...tap(44, 315), ...drag(240, 85, 330, 85)] },
    { name: "settings-rotate", tape: [...tap(44, 315), ...tap(500, 344)] },
    { name: "provision", tape: [...tap(44, 315), ...tap(450, 90)] },
  ],
  offline: [
    { name: "home", tape: [] },
    { name: "lights", tape: tap(44, 155) },
    { name: "sensors", tape: tap(44, 230) },
    { name: "dimmer", tape: [...tap(44, 155), ...hold(150, 150)] },
    { name: "settings", tape: tap(44, 315) },
  ],
  noWeather: [
    { name: "home", tape: [] },
  ],
  arm: [
    { name: "arm-hold-confirm", tape: [...tap(450, 300), ...tap(400, 150), ...hold(400, 150)], verify: verifyAction("arm-gravity", true) },
  ],
};
