import { describe, expect, test } from "bun:test";

import type { LightId } from "./model";
import { activeTab, INITIAL_ROUTE, navigate, nextLight, rowIntent, tabLabel, TABS, tileIntent, type Route } from "./navigation";

const ALL: LightId[] = ["desk", "shelf", "onboard", "remote"];
const OFFLINE: LightId[] = ["desk", "shelf", "onboard"];

describe("tab navigation", () => {
  test("starts on home and switches tabs", () => {
    expect(INITIAL_ROUTE).toEqual({ kind: "tab", tab: "home" });
    const lights = navigate(INITIAL_ROUTE, { type: "tab", tab: "lights" });
    expect(lights).toEqual({ kind: "tab", tab: "lights" });
    expect(navigate(lights, { type: "tab", tab: "lights" })).toBe(lights);
  });

  test("overlays remember their tab and back returns to it", () => {
    const settings: Route = { kind: "tab", tab: "settings" };
    const provision = navigate(settings, { type: "open-provision", topic: "wifi" });
    expect(provision).toEqual({ kind: "provision", topic: "wifi", from: "settings" });
    expect(activeTab(provision)).toBe("settings");
    expect(navigate(provision, { type: "back" })).toEqual(settings);

    const dimmer = navigate({ kind: "tab", tab: "lights" }, { type: "open-dimmer", lightId: "shelf" });
    expect(dimmer).toEqual({ kind: "dimmer", lightId: "shelf", from: "lights" });
    expect(navigate(dimmer, { type: "back" })).toEqual({ kind: "tab", tab: "lights" });
  });

  test("back on a tab stays put", () => {
    expect(navigate(INITIAL_ROUTE, { type: "back" })).toBe(INITIAL_ROUTE);
  });

  test("labels every tab in Chinese and English", () => {
    expect(TABS.map(tab => tabLabel(tab))).toEqual(["首页", "灯光", "环境", "设置"]);
    expect(TABS.map(tab => tabLabel(tab, "en"))).toEqual(["Home", "Lights", "Sensors", "Settings"]);
  });
});

describe("light switching in the dimmer", () => {
  test("cycles in display order and wraps", () => {
    expect(nextLight("desk", 1, ALL)).toBe("shelf");
    expect(nextLight("remote", 1, ALL)).toBe("desk");
    expect(nextLight("desk", -1, ALL)).toBe("remote");
  });

  test("skips lights that are unavailable", () => {
    expect(nextLight("onboard", 1, OFFLINE)).toBe("desk");
    expect(nextLight("desk", -1, OFFLINE)).toBe("onboard");
    expect(nextLight("desk", 1, ["desk"])).toBe("desk");
  });

  test("swipe and chip events move the dimmer to another light", () => {
    const dimmer: Route = { kind: "dimmer", lightId: "onboard", from: "home" };
    expect(navigate(dimmer, { type: "cycle-light", direction: 1, available: ALL })).toEqual({ ...dimmer, lightId: "remote" });
    expect(navigate(dimmer, { type: "select-light", lightId: "desk", available: ALL })).toEqual({ ...dimmer, lightId: "desk" });
    expect(navigate(dimmer, { type: "select-light", lightId: "remote", available: OFFLINE })).toBe(dimmer);
    expect(navigate(INITIAL_ROUTE, { type: "cycle-light", direction: 1, available: ALL })).toBe(INITIAL_ROUTE);
  });
});

describe("tile and row intents", () => {
  test("tile tap toggles, long-press opens the dimmer", () => {
    expect(tileIntent("tap", "desk", ALL)).toEqual({ action: { type: "toggle-light", lightId: "desk" } });
    expect(tileIntent("long-press", "desk", ALL)).toEqual({ nav: { type: "open-dimmer", lightId: "desk" } });
  });

  test("an unavailable tile ignores both gestures", () => {
    expect(tileIntent("tap", "remote", OFFLINE)).toEqual({});
    expect(tileIntent("long-press", "remote", OFFLINE)).toEqual({});
  });

  test("list rows open the dimmer and their switch toggles", () => {
    expect(rowIntent("row", "shelf", ALL)).toEqual({ nav: { type: "open-dimmer", lightId: "shelf" } });
    expect(rowIntent("switch", "shelf", ALL)).toEqual({ action: { type: "toggle-light", lightId: "shelf" } });
    expect(rowIntent("row", "remote", OFFLINE)).toEqual({});
  });
});
