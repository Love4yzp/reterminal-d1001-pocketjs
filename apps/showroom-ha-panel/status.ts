import type { PanelState } from "./model";

export type HaStatusTone = "connected" | "offline" | "unconfigured";

export interface HaStatus {
  tone: HaStatusTone;
  /** Short form for settings rows. */
  label: string;
}

/** The HA connection as the status bar and the settings row show it. */
export function haStatus(state: Pick<PanelState, "haConfigured" | "haConnected">): HaStatus {
  if (!state.haConfigured) return { tone: "unconfigured", label: "未配置" };
  return state.haConnected ? { tone: "connected", label: "已连接" } : { tone: "offline", label: "未连接" };
}
