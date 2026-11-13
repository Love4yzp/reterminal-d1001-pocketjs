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
  language: { left: 200, top: 80, width: 72, height: 34 },
  weather: { left: 274, top: 30, width: 110, height: 68 },
  sensors: { left: 16, top: 118, width: 178, height: 78, gap: 12 },
  mainLight: { left: 16, top: 206, width: 368, height: 82 },
  quickTitleTop: 300,
  quickActions: { left: 16, top: 324, width: 118, height: 56, columnPitch: 126, rowPitch: 64 },
  armActions: { left: 16, top: 456, width: 368, height: 104, gap: 8 },
} as const;

export function portraitSensorBox(index: number): LayoutBox {
  return {
    left: PORTRAIT_HOME.sensors.left + index * (PORTRAIT_HOME.sensors.width + PORTRAIT_HOME.sensors.gap),
    top: PORTRAIT_HOME.sensors.top,
    width: PORTRAIT_HOME.sensors.width,
    height: PORTRAIT_HOME.sensors.height,
  };
}

export function portraitActionBox(index: number): LayoutBox {
  const { left, top, width, height, columnPitch, rowPitch } = PORTRAIT_HOME.quickActions;
  return {
    left: left + (index % 3) * columnPitch,
    top: top + Math.floor(index / 3) * rowPitch,
    width,
    height,
  };
}
