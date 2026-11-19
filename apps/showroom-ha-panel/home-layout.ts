/** Portrait home measurements shared by the screen and its layout test. */
export interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const PORTRAIT_HOME = {
  width: 400,
  height: 640,
  navbarTop: 576,
  /** Gap between the last touch target and the navigation bar. */
  bottomMargin: 16,
  statusBarHeight: 28,
  clockTop: 34,
  dateTop: 92,
  power: { left: 192, top: 34, width: 80, height: 40 },
  language: { left: 200, top: 80, width: 72, height: 34 },
  weather: { left: 274, top: 30, width: 110, height: 68 },
  mainLight: { left: 16, top: 118, width: 368, height: 110 },
  quickTitleTop: 240,
  quickActions: { left: 16, top: 264, width: 118, height: 80, columnPitch: 126, rowPitch: 88 },
  armActions: { left: 16, top: 456, width: 368, height: 104, gap: 8 },
} as const;

export const LANDSCAPE_HOME_POWER: LayoutBox = {
  left: 336,
  top: 40,
  width: 200,
  height: 62,
};

export function portraitActionBox(index: number): LayoutBox {
  const { left, top, width, height, columnPitch, rowPitch } = PORTRAIT_HOME.quickActions;
  return {
    left: left + (index % 3) * columnPitch,
    top: top + Math.floor(index / 3) * rowPitch,
    width,
    height,
  };
}
