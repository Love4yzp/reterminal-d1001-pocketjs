// Pure mapping for the dimming page: HA brightness (0..255) <-> percent,
// vertical slider geometry, swipe classification and the color presets.

export function percentFromBrightness(brightness: number): number {
  return Math.min(100, Math.max(0, Math.round(brightness / 255 * 100)));
}

export function brightnessFromPercent(percent: number): number {
  return Math.min(255, Math.max(0, Math.round(percent * 255 / 100)));
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Percent at a touch y inside a vertical slider whose top edge is `top`. */
export function percentFromY(y: number, top: number, height: number): number {
  return clampPercent((top + height - y) / height * 100);
}

/**
 * Relative drag: the value follows the finger from where the drag began, so
 * grabbing the slider never jumps it. Dragging up (negative dy) brightens.
 */
export function dragPercent(startPercent: number, dy: number, height: number): number {
  return clampPercent(startPercent - dy / height * 100);
}

export function fillHeight(percent: number, height: number): number {
  return Math.round(clampPercent(percent) / 100 * height);
}

export const SWIPE_THRESHOLD = 60;

/** +1 = next light (finger moved left), -1 = previous, 0 = not a swipe. */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

export interface ColorPreset {
  hue: number;
  saturation: number;
}

// Design swatches #ffb74d, #fff3e0, #4fc3f7, #ba68c8 as HA hs_color values.
export const COLOR_PRESETS: readonly [ColorPreset, ColorPreset, ColorPreset, ColorPreset] = [
  { hue: 36, saturation: 70 },
  { hue: 37, saturation: 12 },
  { hue: 199, saturation: 68 },
  { hue: 291, saturation: 48 },
];

export function activePreset(hue: number, saturation: number): number {
  return COLOR_PRESETS.findIndex(preset => preset.hue === hue && preset.saturation === saturation);
}
