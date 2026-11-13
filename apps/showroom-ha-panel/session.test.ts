import { describe, expect, test } from "bun:test";
import { createInitialPanelState } from "./model";
import { INITIAL_ROUTE } from "./navigation";
import { decodeSession, encodeSession, restorePanelState, restoreSettings } from "./session";
import { createSettings, DEFAULT_SCREEN_OFF_SECONDS } from "./settings";

describe("orientation session snapshot", () => {
  test("round-trips lights, the dimmer route and screen timeout", () => {
    const state = createInitialPanelState();
    state.lights.desk = { on: false, brightness: 42, hue: 271, saturation: 33 };
    const route = { kind: "dimmer" as const, lightId: "desk" as const, from: "settings" as const };
    const settings = { ...createSettings(64), screenOffSeconds: 300 };
    const saved = decodeSession(encodeSession(state, route, settings, "en"));
    expect(saved).not.toBeNull();
    expect(saved!.lights.desk).toEqual({ on: false, brightness: 42, hue: 271, saturation: 33 });
    expect(saved!.route).toEqual(route);
    expect(saved!.settings.screenOffSeconds).toBe(300);
    expect(saved!.language).toBe("en");
    expect(restorePanelState(state, saved!).lights.desk).toEqual(saved!.lights.desk);
    expect(restoreSettings(settings, saved!).screenOffSeconds).toBe(300);
  });

  test("keeps a tab route and rejects malformed snapshots", () => {
    const saved = decodeSession(encodeSession(createInitialPanelState(), { kind: "tab", tab: "lights" }, createSettings(50)));
    expect(saved!.route).toEqual({ kind: "tab", tab: "lights" });
    expect(saved!.language).toBe("zh");
    expect(decodeSession("not json")).toBeNull();
    expect(decodeSession('{"version":2}')).toBeNull();
    expect(decodeSession('{"version":1,"route":{"kind":"tab","tab":"bogus"}}')!.route).toEqual(INITIAL_ROUTE);
    expect(decodeSession('{"version":1,"route":{"kind":"arm","from":"home"}}')!.route).toEqual(INITIAL_ROUTE);
    expect(decodeSession('{"version":1,"language":"fr"}')!.language).toBe("zh");
  });

  test("clamps light values and ignores unknown settings", () => {
    const saved = decodeSession(JSON.stringify({
      version: 1,
      lights: { desk: { on: true, brightness: 999, hue: -1, saturation: 101 } },
      route: { kind: "tab", tab: "home" },
      settings: { screenOffSeconds: 45 },
    }));
    expect(saved!.lights.desk).toEqual({ on: true, brightness: 255, hue: 0, saturation: 100 });
    expect(saved!.settings.screenOffSeconds).toBe(DEFAULT_SCREEN_OFF_SECONDS);
  });
});
