import { pick, type Language } from "./i18n";
import type { PanelState } from "./model";

export type HaStatusTone = "connected" | "offline" | "unconfigured";

export interface HaStatus {
  tone: HaStatusTone;
  /** Short form for settings rows. */
  label: string;
}

/** The HA connection as the status bar and the settings row show it. */
export function haStatus(
  state: Pick<PanelState, "haConfigured" | "haConnected">,
  language: Language = "zh",
): HaStatus {
  if (!state.haConfigured) return { tone: "unconfigured", label: pick(language, "连接中", "Connecting") };
  return state.haConnected
    ? { tone: "connected", label: pick(language, "已连接", "Connected") }
    : { tone: "offline", label: pick(language, "连接中", "Connecting") };
}
