// Pure mapping for the dimming page: HA brightness (0..255) <-> percent,
// vertical slider geometry, the hue/saturation wheel and swipe classification.

/** The dimmer's two control surfaces. Lifted into the panel so a state tick does not reset it. */
export type DimmerMode = "brightness" | "color";

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

/**
 * Hue and saturation at a touch inside a circular wheel: the angle is the hue
 * (0 at the top, clockwise) and the distance from the center is saturation.
 * Touches outside the radius clamp to full saturation.
 */
export function hueSaturationFromPoint(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radius: number,
): { hue: number; saturation: number } {
  const dx = x - centerX;
  const dy = y - centerY;
  if (dx === 0 && dy === 0) return { hue: 0, saturation: 0 };
  const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  const hue = ((Math.round(angle) % 360) + 360) % 360;
  const distance = radius > 0 ? Math.hypot(dx, dy) : 0;
  return { hue, saturation: clampPercent(distance / radius * 100) };
}

/** The touch position for a hue/saturation value inside the same wheel. */
export function wheelPoint(
  hue: number,
  saturation: number,
  centerX: number,
  centerY: number,
  radius: number,
): { x: number; y: number } {
  const angle = hue * Math.PI / 180;
  const distance = radius * clampPercent(saturation) / 100;
  return {
    x: Math.round(centerX + Math.sin(angle) * distance),
    y: Math.round(centerY - Math.cos(angle) * distance),
  };
}
