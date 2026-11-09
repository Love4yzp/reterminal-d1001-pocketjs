import { LIGHT_IDS, type LightId, type PanelAction } from "./model";

export type Tab = "home" | "lights" | "settings";
export type ProvisionTopic = "wifi" | "ha";

export const TABS: readonly { id: Tab; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "lights", label: "灯光" },
  { id: "settings", label: "设置" },
];

/** Tabs are top-level; the dimmer and provisioning pages overlay the tab they came from. */
export type Route =
  | { kind: "tab"; tab: Tab }
  | { kind: "dimmer"; lightId: LightId; from: Tab }
  | { kind: "provision"; topic: ProvisionTopic; from: Tab };

export type NavEvent =
  | { type: "tab"; tab: Tab }
  | { type: "open-dimmer"; lightId: LightId }
  | { type: "open-provision"; topic: ProvisionTopic }
  | { type: "cycle-light"; direction: -1 | 1; available: readonly LightId[] }
  | { type: "select-light"; lightId: LightId; available: readonly LightId[] }
  | { type: "back" };

export const INITIAL_ROUTE: Route = { kind: "tab", tab: "home" };

export function activeTab(route: Route): Tab {
  return route.kind === "tab" ? route.tab : route.from;
}

/** The next available light in display order, wrapping; `current` if none other is available. */
export function nextLight(current: LightId, direction: -1 | 1, available: readonly LightId[]): LightId {
  const start = LIGHT_IDS.indexOf(current);
  for (let step = 1; step <= LIGHT_IDS.length; step += 1) {
    const index = (start + direction * step + LIGHT_IDS.length * step) % LIGHT_IDS.length;
    const candidate = LIGHT_IDS[index]!;
    if (available.includes(candidate)) return candidate;
  }
  return current;
}

export function navigate(route: Route, event: NavEvent): Route {
  switch (event.type) {
    case "tab":
      return route.kind === "tab" && route.tab === event.tab ? route : { kind: "tab", tab: event.tab };
    case "open-dimmer":
      return { kind: "dimmer", lightId: event.lightId, from: activeTab(route) };
    case "open-provision":
      return { kind: "provision", topic: event.topic, from: activeTab(route) };
    case "cycle-light": {
      if (route.kind !== "dimmer") return route;
      const lightId = nextLight(route.lightId, event.direction, event.available);
      return lightId === route.lightId ? route : { ...route, lightId };
    }
    case "select-light":
      if (route.kind !== "dimmer" || route.lightId === event.lightId || !event.available.includes(event.lightId))
        return route;
      return { ...route, lightId: event.lightId };
    case "back":
      return route.kind === "tab" ? route : { kind: "tab", tab: route.from };
  }
}

export interface TileIntent {
  action?: PanelAction;
  nav?: NavEvent;
}

/** Home tile: tap toggles, long-press opens the dimmer; an unavailable tile does nothing. */
export function tileIntent(gesture: "tap" | "long-press", lightId: LightId, available: readonly LightId[]): TileIntent {
  if (!available.includes(lightId)) return {};
  return gesture === "tap"
    ? { action: { type: "toggle-light", lightId } }
    : { nav: { type: "open-dimmer", lightId } };
}

/** Lights tab row: the switch toggles, the rest of the row opens the dimmer. */
export function rowIntent(target: "row" | "switch", lightId: LightId, available: readonly LightId[]): TileIntent {
  if (!available.includes(lightId)) return {};
  return target === "switch"
    ? { action: { type: "toggle-light", lightId } }
    : { nav: { type: "open-dimmer", lightId } };
}
