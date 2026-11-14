import { pick, type Language } from "./i18n";

export const SCREEN_OFF_OPTIONS: readonly { seconds: number; label: string; labelEn: string }[] = [
  { seconds: 30, label: "30秒", labelEn: "30s" },
  { seconds: 60, label: "1分", labelEn: "1m" },
  { seconds: 300, label: "5分", labelEn: "5m" },
  { seconds: 0, label: "常亮", labelEn: "Always" },
];

export function screenOffLabel(
  option: Pick<(typeof SCREEN_OFF_OPTIONS)[number], "label" | "labelEn">,
  language: Language = "zh",
): string {
  return pick(language, option.label, option.labelEn);
}

export const DEFAULT_SCREEN_OFF_SECONDS = 0;
export const MIN_BACKLIGHT = 5;

export interface SettingsState {
  backlight: number | null;
  screenOffSeconds: number;
}

export type SettingsAction =
  | { type: "backlight"; percent: number }
  | { type: "screen-off"; seconds: number };

export function clampBacklight(percent: number): number {
  return Math.min(100, Math.max(MIN_BACKLIGHT, Math.round(percent)));
}

export function backlightFromX(x: number, left: number, width: number): number {
  return clampBacklight(((x - left) / width) * 100);
}

export function createSettings(backlight: number | null): SettingsState {
  return {
    backlight: backlight === null ? null : clampBacklight(backlight),
    screenOffSeconds: DEFAULT_SCREEN_OFF_SECONDS,
  };
}

export function reduceSettings(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "backlight": {
      if (state.backlight === null) return state;
      const backlight = clampBacklight(action.percent);
      return backlight === state.backlight ? state : { ...state, backlight };
    }
    case "screen-off":
      if (!SCREEN_OFF_OPTIONS.some(option => option.seconds === action.seconds) ||
          action.seconds === state.screenOffSeconds)
        return state;
      return { ...state, screenOffSeconds: action.seconds };
  }
}

export interface ScreenOffNative {
  setScreenOffSeconds(seconds: number): boolean;
}

export interface ScreenOffControl {
  apply(seconds: number): boolean;
}

export function createScreenOffControl(native: ScreenOffNative | undefined): ScreenOffControl {
  return {
    apply(seconds) {
      return typeof native?.setScreenOffSeconds === "function" ? native.setScreenOffSeconds(seconds) === true : false;
    },
  };
}
