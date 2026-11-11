import { describe, expect, test } from "bun:test";

import { lightColor, lightStatusText, lightTone } from "./lights";
import { createInitialPanelState, reducePanel } from "./model";

describe("light presentation", () => {
  test("status text shows percent when on, 关 when off and 未连接 HA when unavailable", () => {
    const state = reducePanel(createInitialPanelState(), { type: "set-brightness", lightId: "desk", brightness: 204 });
    expect(lightStatusText(state, "desk")).toBe("开 80%");
    expect(lightStatusText(state, "shelf")).toBe("关");
    expect(lightStatusText(state, "remote")).toBe("未连接 HA");
  });

  test("light color carries hue and saturation in ABGR", () => {
    expect(lightColor({ on: true, brightness: 255, hue: 0, saturation: 100 })).toBe(0xff0000ff);
    expect(lightColor({ on: true, brightness: 255, hue: 0, saturation: 0 })).toBe(0xffffffff);
  });

  test("tone is amber for warm light, blue for cool light, grey when off or offline", () => {
    let state = reducePanel(createInitialPanelState(), { type: "set-color", lightId: "desk", hue: 36, saturation: 70 });
    expect(lightTone(state, "desk")).toBe("on");
    state = reducePanel(state, { type: "set-color", lightId: "desk", hue: 199, saturation: 68 });
    expect(lightTone(state, "desk")).toBe("cool");
    state = reducePanel(state, { type: "set-color", lightId: "desk", hue: 199, saturation: 10 });
    expect(lightTone(state, "desk")).toBe("on");
    expect(lightTone(state, "shelf")).toBe("off");
    expect(lightTone(state, "remote")).toBe("unavailable");
  });
});
