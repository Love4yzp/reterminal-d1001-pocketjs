import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  LANDSCAPE_HEIGHT,
  LANDSCAPE_WIDTH,
  LANDSCAPE_BUTTON,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  landscapePlacement,
  nextOrientation,
  orientationLabel,
  isLandscape,
  rotatedBounds,
  rotationDegrees,
} from "./orientation";

describe("factory demo orientation", () => {
  test("cycles portrait, clockwise landscape, counter-clockwise landscape", () => {
    expect(nextOrientation("portrait")).toBe("landscape-cw");
    expect(nextOrientation("landscape-cw")).toBe("landscape-ccw");
    expect(nextOrientation("landscape-ccw")).toBe("portrait");
  });

  test("turns the landscape canvas by 90 degrees in both directions", () => {
    expect(rotationDegrees("portrait")).toBe(0);
    expect(rotationDegrees("landscape-cw")).toBe(90);
    expect(rotationDegrees("landscape-ccw")).toBe(-90);
  });

  test("keeps every landscape composition inside the portrait raster", () => {
    for (const orientation of ["landscape-cw", "landscape-ccw"] as const) {
      const bounds = rotatedBounds(orientation);
      expect(bounds.left).toBe(0);
      expect(bounds.top).toBe(0);
      expect(bounds.width).toBe(PORTRAIT_WIDTH);
      expect(bounds.height).toBe(PORTRAIT_HEIGHT);
    }
  });

  test("places the canvas so its turned corner fills the portrait origin", () => {
    expect(landscapePlacement("landscape-cw")).toEqual({ left: PORTRAIT_WIDTH, top: 0 });
    expect(landscapePlacement("landscape-ccw")).toEqual({ left: 0, top: PORTRAIT_HEIGHT });
    expect(LANDSCAPE_WIDTH).toBe(640);
    expect(LANDSCAPE_HEIGHT).toBe(400);
  });

  test("the baked green button is inside the landscape canvas", () => {
    expect(LANDSCAPE_BUTTON.left).toBeGreaterThanOrEqual(0);
    expect(LANDSCAPE_BUTTON.top).toBeGreaterThanOrEqual(0);
    expect(LANDSCAPE_BUTTON.left + LANDSCAPE_BUTTON.width).toBeLessThanOrEqual(LANDSCAPE_WIDTH);
    expect(LANDSCAPE_BUTTON.top + LANDSCAPE_BUTTON.height).toBeLessThanOrEqual(LANDSCAPE_HEIGHT);
  });

  test("labels the active mode without claiming portrait is landscape", () => {
    expect(isLandscape("portrait")).toBe(false);
    expect(isLandscape("landscape-cw")).toBe(true);
    expect(orientationLabel("portrait")).toBe("PORTRAIT");
    expect(orientationLabel("landscape-cw")).toContain("LANDSCAPE");
    expect(orientationLabel("landscape-ccw")).toContain("LANDSCAPE");
  });

  test("the landscape texture stays a 512x512 power of two", () => {
    const png = readFileSync(new URL("./art/landscape.png", import.meta.url));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });
});
