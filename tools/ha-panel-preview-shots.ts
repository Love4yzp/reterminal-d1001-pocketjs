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

export const LANDSCAPE_SHOTS: { connected: Shot[]; offline: Shot[]; noWeather: Shot[] } = {
  connected: [
    { name: "home", tape: [] },
    { name: "home-toggle", tape: tap(150, 190) },
    { name: "scene-night", tape: tap(330, 334) },
    { name: "lights", tape: tap(44, 215) },
    { name: "lights-switch", tape: [...tap(44, 215), ...tap(311, 190)] },
    { name: "lights-row", tape: [...tap(44, 215), ...tap(150, 150)] },
    { name: "dimmer", tape: hold(150, 190) },
    { name: "dimmer-drag", tape: [...hold(150, 190), ...drag(240, 340, 240, 200)] },
    { name: "dimmer-swipe", tape: [...hold(150, 190), ...drag(500, 250, 100, 250)] },
    { name: "dimmer-preset", tape: [...hold(150, 190), ...tap(494, 342)] },
    { name: "settings", tape: tap(44, 315) },
    { name: "settings-timeout", tape: [...tap(44, 315), ...tap(170, 240)] },
    { name: "settings-backlight", tape: [...tap(44, 315), ...drag(240, 85, 330, 85)] },
    { name: "settings-rotate", tape: [...tap(44, 315), ...tap(500, 344)] },
    { name: "provision", tape: [...tap(44, 315), ...tap(450, 90)] },
  ],
  offline: [
    { name: "home", tape: [] },
    { name: "lights", tape: tap(44, 215) },
    { name: "dimmer", tape: hold(150, 190) },
    { name: "settings", tape: tap(44, 315) },
  ],
  noWeather: [
    { name: "home", tape: [] },
  ],
};
