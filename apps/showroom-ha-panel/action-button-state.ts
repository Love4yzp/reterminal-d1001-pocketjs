import type { ActionRunStatus } from "./showroom";
import { theme } from "./theme";

export interface ActionButtonVisual {
  background: number;
  text: number;
}

/** Arm buttons re-open only after their request has returned to idle. */
export function actionButtonEnabled(
  group: "reachy" | "arm",
  status: ActionRunStatus,
  configured: boolean,
  connected: boolean,
): boolean {
  return configured && connected && (group !== "arm" || status === "idle");
}

/**
 * Visual-only request feedback. Accepted and failed both expire after
 * ACTION_FEEDBACK_FRAMES; no status word is ever drawn on the button.
 */
export function actionButtonVisual(status: ActionRunStatus, stop: boolean, ready: boolean): ActionButtonVisual {
  if (!ready) return { background: stop ? theme.dangerChip : theme.secondaryBackground, text: theme.disabledText };
  if (stop) {
    if (status === "pending") return { background: theme.primaryChip, text: theme.white };
    if (status === "accepted") return { background: theme.danger, text: theme.white };
    if (status === "failed") return { background: theme.secondaryBackground, text: theme.danger };
    return { background: theme.dangerChip, text: theme.danger };
  }
  switch (status) {
    case "pending": return { background: theme.primaryChip, text: theme.text };
    case "accepted": return { background: theme.tileOn, text: theme.on };
    case "failed": return { background: theme.dangerChip, text: theme.danger };
    case "idle": return { background: theme.secondaryBackground, text: theme.text };
  }
}
