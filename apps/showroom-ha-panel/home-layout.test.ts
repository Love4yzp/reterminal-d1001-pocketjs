import { describe, expect, test } from "bun:test";

import { PORTRAIT_HOME, portraitActionBox, portraitSensorBox } from "./home-layout";
import { SHOWROOM } from "./showroom";

describe("portrait home layout", () => {
  test("puts the sensor cards above the main-light card", () => {
    const sensorsBottom = PORTRAIT_HOME.sensors.top + PORTRAIT_HOME.sensors.height;
    expect(sensorsBottom).toBeLessThan(PORTRAIT_HOME.mainLight.top);
    expect(PORTRAIT_HOME.mainLight.top + PORTRAIT_HOME.mainLight.height).toBeLessThan(PORTRAIT_HOME.quickTitleTop);
  });

  test("stacks status, sensors, light, quick actions and arm actions in one column", () => {
    expect(PORTRAIT_HOME.statusBarHeight).toBeLessThan(PORTRAIT_HOME.sensors.top);
    expect(PORTRAIT_HOME.sensors.top + PORTRAIT_HOME.sensors.height).toBeLessThan(PORTRAIT_HOME.mainLight.top);
    expect(PORTRAIT_HOME.mainLight.top + PORTRAIT_HOME.mainLight.height)
      .toBeLessThan(PORTRAIT_HOME.quickActions.top);
    const actionRowsBottom = PORTRAIT_HOME.quickActions.top + PORTRAIT_HOME.quickActions.rowPitch
      + PORTRAIT_HOME.quickActions.height;
    expect(actionRowsBottom).toBeLessThan(PORTRAIT_HOME.armActions.top);
  });

  test("uses the requested card, action and arm heights", () => {
    expect(PORTRAIT_HOME.sensors.height).toBeGreaterThanOrEqual(76);
    expect(PORTRAIT_HOME.sensors.height).toBeLessThanOrEqual(80);
    expect(PORTRAIT_HOME.mainLight.height).toBeGreaterThanOrEqual(82);
    expect(PORTRAIT_HOME.mainLight.height).toBeLessThanOrEqual(84);
    expect(PORTRAIT_HOME.quickActions.height).toBeGreaterThanOrEqual(54);
    expect(PORTRAIT_HOME.quickActions.height).toBeLessThanOrEqual(56);
    expect(PORTRAIT_HOME.armActions.height).toBeGreaterThanOrEqual(102);
    expect(PORTRAIT_HOME.armActions.height).toBeLessThanOrEqual(108);
  });

  test("leaves only a 12-16 px gap above the navigation bar", () => {
    const armBottom = PORTRAIT_HOME.armActions.top + PORTRAIT_HOME.armActions.height;
    const gap = PORTRAIT_HOME.navbarTop - armBottom;
    expect(gap).toBe(PORTRAIT_HOME.bottomMargin);
    expect(gap).toBeGreaterThanOrEqual(12);
    expect(gap).toBeLessThanOrEqual(16);
  });

  test("lays six quick actions out as two rows of three without overlap", () => {
    expect(SHOWROOM.home.actions).toHaveLength(6);
    const boxes = SHOWROOM.home.actions.map((_, index) => portraitActionBox(index));
    expect(boxes[0]!.top).toBe(boxes[2]!.top);
    expect(boxes[3]!.top).toBeGreaterThan(boxes[0]!.top);
    for (const [index, box] of boxes.entries()) {
      expect(box.left + box.width).toBeLessThanOrEqual(PORTRAIT_HOME.width - 12);
      if (index % 3 > 0) expect(box.left).toBeGreaterThan(boxes[index - 1]!.left + boxes[index - 1]!.width);
    }
    expect(boxes[2]!.top + boxes[2]!.height).toBeLessThan(PORTRAIT_HOME.armActions.top);
  });

  test("keeps both sensor cards inside the page and the language pill away from the weather", () => {
    const first = portraitSensorBox(0);
    const second = portraitSensorBox(1);
    expect(first.left).toBe(16);
    expect(second.left + second.width).toBe(PORTRAIT_HOME.width - 16);
    expect(PORTRAIT_HOME.language.width).toBeGreaterThanOrEqual(72);
    expect(PORTRAIT_HOME.language.height).toBeGreaterThanOrEqual(34);
    expect(PORTRAIT_HOME.language.left).toBeGreaterThanOrEqual(20 + 176 + 4);
    expect(PORTRAIT_HOME.language.left + PORTRAIT_HOME.language.width)
      .toBeLessThan(PORTRAIT_HOME.weather.left);
    expect(PORTRAIT_HOME.language.top + PORTRAIT_HOME.language.height).toBeLessThan(PORTRAIT_HOME.sensors.top);
  });
});
