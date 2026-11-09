import { gestures, type Shot } from "./ha-panel-preview.ts";

const { tap, hold, drag } = gestures;

export const SHOTS: { connected: Shot[]; offline: Shot[]; noWeather: Shot[] } = {
  connected: [
    { name: "home", tape: [] },
    { name: "home-toggle", tape: tap(90, 180) },
    { name: "scene-night", tape: tap(200, 437) },
    { name: "lights", tape: tap(200, 610) },
    { name: "lights-switch", tape: [...tap(200, 610), ...tap(290, 160)] },
    { name: "lights-row", tape: [...tap(200, 610), ...tap(100, 160)] },
    { name: "dimmer", tape: hold(90, 180) },
    { name: "dimmer-drag", tape: [...hold(90, 180), ...drag(200, 390, 200, 270)] },
    { name: "dimmer-swipe", tape: [...hold(90, 180), ...drag(330, 450, 90, 450)] },
    { name: "dimmer-preset", tape: [...hold(90, 180), ...tap(262, 500)] },
    { name: "settings", tape: tap(333, 610) },
    { name: "settings-timeout", tape: [...tap(333, 610), ...tap(242, 199)] },
    { name: "settings-backlight", tape: [...tap(333, 610), ...drag(240, 100, 330, 100)] },
    { name: "provision", tape: [...tap(333, 610), ...tap(100, 296)] },
  ],
  offline: [
    { name: "home", tape: [] },
    { name: "lights", tape: tap(200, 610) },
    { name: "dimmer", tape: hold(90, 180) },
    { name: "settings", tape: tap(333, 610) },
  ],
  noWeather: [
    { name: "home", tape: [] },
  ],
};
