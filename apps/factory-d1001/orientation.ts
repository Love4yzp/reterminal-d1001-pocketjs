/** The factory demo cycles through portrait and both landscape mountings. */
export const PORTRAIT_WIDTH = 400;
export const PORTRAIT_HEIGHT = 640;
export const LANDSCAPE_WIDTH = 640;
export const LANDSCAPE_HEIGHT = 400;

export type Orientation = "portrait" | "landscape-cw" | "landscape-ccw";

export const ORIENTATION_CYCLE: readonly Orientation[] = [
  "portrait",
  "landscape-cw",
  "landscape-ccw",
];

/** The next mode the green button selects. */
export function nextOrientation(current: Orientation): Orientation {
  const index = ORIENTATION_CYCLE.indexOf(current);
  return ORIENTATION_CYCLE[(index + 1) % ORIENTATION_CYCLE.length]!;
}

export function isLandscape(orientation: Orientation): boolean {
  return orientation !== "portrait";
}

/** Degrees the 640x400 canvas is turned inside the 400x640 raster. */
export function rotationDegrees(orientation: Orientation): 0 | 90 | -90 {
  if (orientation === "landscape-cw") return 90;
  if (orientation === "landscape-ccw") return -90;
  return 0;
}

/**
 * Where the landscape canvas sits before it is turned about its top-left
 * corner. Positive rotation is clockwise, as in CSS/PocketJS.
 */
export function landscapePlacement(orientation: Orientation): { left: number; top: number } {
  if (orientation === "landscape-cw") return { left: PORTRAIT_WIDTH, top: 0 };
  if (orientation === "landscape-ccw") return { left: 0, top: PORTRAIT_HEIGHT };
  return { left: 0, top: 0 };
}

/** Visual label used by the demo's header. */
export function orientationLabel(orientation: Orientation): string {
  if (orientation === "landscape-cw") return "LANDSCAPE 90°";
  if (orientation === "landscape-ccw") return "LANDSCAPE -90°";
  return "PORTRAIT";
}

/** The green button baked into art/landscape.png, in landscape coordinates. */
export const LANDSCAPE_BUTTON = { left: 20, top: 316, width: 180, height: 44 } as const;

/** Axis-aligned bounds after rotating a landscape canvas about its top-left. */
export function rotatedBounds(orientation: Orientation): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const placement = landscapePlacement(orientation);
  const degrees = rotationDegrees(orientation);
  if (degrees === 0)
    return { left: 0, top: 0, width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT };
  if (degrees === 90)
    return { left: placement.left - LANDSCAPE_HEIGHT, top: placement.top, width: LANDSCAPE_HEIGHT, height: LANDSCAPE_WIDTH };
  return { left: placement.left, top: placement.top - LANDSCAPE_WIDTH, width: LANDSCAPE_HEIGHT, height: LANDSCAPE_WIDTH };
}
