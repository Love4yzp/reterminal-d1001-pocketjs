import { describe, expect, test } from "bun:test";

import { lightCommandForAction, mergeLightCommands } from "./console";
import { reducePanel } from "./model";
import { connectedState } from "./test-utils";

describe("console light commands", () => {
  test("maps continuous dimmer actions to exact HA commands", () => {
    let state = connectedState();
    const brightness = { type: "set-brightness", lightId: "remote", brightness: 64 } as const;
    state = reducePanel(state, brightness);
    expect(lightCommandForAction(brightness, state.lights.remote)).toEqual({ on: true, brightnessPct: 25 });

    const color = { type: "set-color", lightId: "remote", hue: 240, saturation: 100, on: true } as const;
    state = reducePanel(state, color);
    expect(lightCommandForAction(color, state.lights.remote)).toEqual({ on: true, rgbColor: [0, 0, 255] });
  });

  test("coalesces rapid dimmer changes per light", () => {
    expect(mergeLightCommands(
      { on: true, brightnessPct: 25, rgbColor: [255, 0, 0] },
      { on: true, brightnessPct: 60 },
    )).toEqual({ on: true, brightnessPct: 60, rgbColor: [255, 0, 0] });
    expect(mergeLightCommands(
      { on: true, brightnessPct: 25 },
      { on: false },
    )).toEqual({ on: false, brightnessPct: 25 });
  });
});
