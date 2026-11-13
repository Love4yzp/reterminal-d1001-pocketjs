import { describe, expect, test } from "bun:test";

import { actionButtonEnabled, actionButtonVisual } from "./action-button-state";
import { actionButtonLabel, SHOWROOM } from "./showroom";
import { theme } from "./theme";

const STATUSES = ["idle", "pending", "accepted", "failed"] as const;

describe("action button presentation", () => {
  test("draws only an action name in both languages, never a status word", () => {
    for (const action of SHOWROOM.actions) {
      for (const language of ["zh", "en"] as const) {
        const label = actionButtonLabel(action, language);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(/已受理|已发送|发送中|未完成/);
      }
    }
  });

  test("STOP has a distinct visual for every request status", () => {
    const idle = actionButtonVisual("idle", true, true);
    const pending = actionButtonVisual("pending", true, true);
    const accepted = actionButtonVisual("accepted", true, true);
    const failed = actionButtonVisual("failed", true, true);

    expect(idle).toEqual({ background: theme.dangerChip, text: theme.danger });
    expect(pending.background).toBe(theme.primaryChip);
    expect(accepted).toEqual({ background: theme.danger, text: theme.white });
    expect(failed).toEqual({ background: theme.secondaryBackground, text: theme.danger });
    expect(new Set([idle.background, pending.background, accepted.background, failed.background]).size).toBe(4);
  });

  test("every non-STOP action has a different visual for each request status", () => {
    for (const action of SHOWROOM.actions.filter(action => action.key !== "reachy-stop")) {
      const idle = actionButtonVisual("idle", false, true);
      const pending = actionButtonVisual("pending", false, true);
      const accepted = actionButtonVisual("accepted", false, true);
      const failed = actionButtonVisual("failed", false, true);
      expect(new Set([idle.background, pending.background, accepted.background, failed.background]).size, action.key)
        .toBe(4);
      expect(accepted).toEqual({ background: theme.tileOn, text: theme.on });
      expect(failed).toEqual({ background: theme.dangerChip, text: theme.danger });
    }
  });

  test("an unready button stays disabled through every status", () => {
    for (const status of STATUSES)
      expect(actionButtonVisual(status, false, false).text).toBe(theme.disabledText);
  });

  test("arm buttons are clickable again only after the status returns to idle", () => {
    for (const action of SHOWROOM.actions) {
      for (const status of STATUSES) {
        const expected = action.group !== "arm" || status === "idle";
        expect(actionButtonEnabled(action.group, status, true, true), `${action.key} ${status}`).toBe(expected);
      }
      expect(actionButtonEnabled(action.group, "idle", true, false)).toBe(false);
      expect(actionButtonEnabled(action.group, "idle", false, true)).toBe(false);
    }
  });
});
