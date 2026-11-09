import { describe, expect, test } from "bun:test";

import { createInitialPanelState, LIGHT_IDS, reducePanel, type PanelState } from "./model";
import { sceneAction, SCENES } from "./scenes";

function connected(): PanelState {
  return reducePanel(createInitialPanelState(), {
    type: "ha", haConfigured: true, haConnected: true, haLightConfigured: true,
  });
}

const apply = (state: PanelState, scene: Parameters<typeof sceneAction>[1]) => reducePanel(state, sceneAction(state, scene));

describe("scenes", () => {
  test("lists the three design scenes in order", () => {
    expect(SCENES.map(scene => scene.label)).toEqual(["全部关闭", "夜间模式", "阅读"]);
  });

  test("全部关闭 turns every light off in one batch", () => {
    const lit = reducePanel(connected(), { type: "set-lights", changes: { shelf: { on: true }, remote: { on: true } } });
    const action = sceneAction(lit, "all-off");
    expect(action.type).toBe("set-lights");
    const next = reducePanel(lit, action);
    for (const lightId of LIGHT_IDS) expect(next.lights[lightId].on).toBe(false);
  });

  test("夜间模式 dims the lights it uses to warm 10%", () => {
    const next = apply(connected(), "night");
    expect(next.lights.desk.on).toBe(false);
    for (const lightId of ["shelf", "onboard", "remote"] as const)
      expect(next.lights[lightId]).toEqual({ on: true, brightness: 26, hue: 30, saturation: 85 });
  });

  test("阅读 sets bright warm white and leaves the onboard RGB off", () => {
    const next = apply(connected(), "reading");
    expect(next.lights.desk).toMatchObject({ on: true, brightness: 255, saturation: 12 });
    expect(next.lights.shelf).toMatchObject({ on: true, brightness: 153 });
    expect(next.lights.remote).toMatchObject({ on: true, brightness: 204 });
    expect(next.lights.onboard.on).toBe(false);
  });

  test("an offline HA light is left out of the batch", () => {
    const offline = createInitialPanelState();
    const action = sceneAction(offline, "reading");
    expect(action).toMatchObject({ type: "set-lights" });
    expect(Object.keys((action as { changes: object }).changes)).toEqual(["desk", "shelf", "onboard"]);
    expect(apply(offline, "reading").lights.remote).toEqual(offline.lights.remote);
  });
});
