// Settings page state. The backlight goes through the framework device
// binding; auto screen-off goes through the native input state machine.

export const SCREEN_OFF_OPTIONS: readonly { seconds: number; label: string }[] = [
  { seconds: 30, label: "30 秒" },
  { seconds: 60, label: "1 分钟" },
  { seconds: 300, label: "5 分钟" },
  { seconds: 0, label: "从不" },
];

export const DEFAULT_SCREEN_OFF_SECONDS = 60;
/** The panel never dims itself fully dark from the slider. */
export const MIN_BACKLIGHT = 5;

export interface SettingsState {
  /** 0..100, null when the host has no backlight binding. */
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
  return clampBacklight((x - left) / width * 100);
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

export interface ScreenOffControl {
  /** True when the native state machine accepted the timeout. */
  apply(seconds: number): boolean;
}

/** Native timer hook; 0 means never turn the screen off. */
export interface ScreenOffNative {
  setScreenOffSeconds(seconds: number): boolean;
}

export function createScreenOffControl(native: ScreenOffNative | undefined): ScreenOffControl {
  return {
    apply(seconds) {
      return typeof native?.setScreenOffSeconds === "function" ? native.setScreenOffSeconds(seconds) === true : false;
    },
  };
}
