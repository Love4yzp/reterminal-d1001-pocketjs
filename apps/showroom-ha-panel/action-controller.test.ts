import { describe, expect, test } from "bun:test";

import {
  ACTION_FEEDBACK_FRAMES,
  ACTION_PENDING_TIMEOUT_FRAMES,
  actionRunId,
  actionStatus,
  createActionRunStates,
  disconnectActionRuns,
  finishActionRun,
  startActionRun,
  tickActionRuns,
} from "./action-controller";
import { SHOWROOM } from "./showroom";

const ACTIONS = SHOWROOM.actions.map(action => action.key);

function fresh() {
  return createActionRunStates(ACTIONS);
}

describe("action run controller", () => {
  test("every Reachy and arm result stays visible through frame 89 and returns idle on frame 90", () => {
    expect(ACTIONS).toHaveLength(8);
    expect(SHOWROOM.actions.filter(action => action.group === "reachy")).toHaveLength(6);
    expect(SHOWROOM.actions.filter(action => action.group === "arm")).toHaveLength(2);
    for (const actionId of ACTIONS) {
      const started = startActionRun(fresh(), actionId, 0)!;
      const accepted = finishActionRun(started.state, actionId, started.runId, "accepted", 10);
      expect(accepted.status, actionId).toBe("accepted");

      const frame89 = tickActionRuns(accepted.state, 10 + ACTION_FEEDBACK_FRAMES - 1);
      expect(frame89.expired, actionId).toEqual([]);
      expect(actionStatus(frame89.state, actionId), actionId).toBe("accepted");

      const frame90 = tickActionRuns(frame89.state, 10 + ACTION_FEEDBACK_FRAMES);
      expect(frame90.expired, actionId).toEqual([actionId]);
      expect(actionStatus(frame90.state, actionId), actionId).toBe("idle");

      const again = startActionRun(frame90.state, actionId, 200)!;
      expect(again.runId, actionId).toBeGreaterThan(started.runId);
      expect(actionStatus(again.state, actionId), actionId).toBe("pending");
    }
  });

  test("failed feedback also resets exactly 90 frames after the result", () => {
    for (const actionId of ACTIONS) {
      const started = startActionRun(fresh(), actionId, 4)!;
      const failed = finishActionRun(started.state, actionId, started.runId, "failed", 20);
      expect(failed.status).toBe("failed");
      expect(actionStatus(tickActionRuns(failed.state, 20 + 89).state, actionId)).toBe("failed");
      const expired = tickActionRuns(failed.state, 20 + ACTION_FEEDBACK_FRAMES);
      expect(expired.expired).toEqual([actionId]);
      expect(actionStatus(expired.state, actionId)).toBe("idle");
    }
  });

  test("a rapid second tap invalidates the first run and its late result", () => {
    const first = startActionRun(fresh(), "arm-gravity", 0)!;
    const second = startActionRun(first.state, "arm-gravity", 1)!;
    expect(second.runId).toBe(first.runId + 1);

    const late = finishActionRun(second.state, "arm-gravity", first.runId, "accepted", 2);
    expect(late.status).toBeNull();
    expect(actionStatus(late.state, "arm-gravity")).toBe("pending");
    expect(actionRunId(late.state, "arm-gravity")).toBe(second.runId);

    const latest = finishActionRun(late.state, "arm-gravity", second.runId, "accepted", 3);
    expect(latest.status).toBe("accepted");
    expect(actionStatus(latest.state, "arm-gravity")).toBe("accepted");

    const duplicate = finishActionRun(latest.state, "arm-gravity", second.runId, "failed", 4);
    expect(duplicate.status).toBeNull();
    expect(actionStatus(duplicate.state, "arm-gravity")).toBe("accepted");
  });

  test("disconnect clears pending and accepted runs and ignores every old result", () => {
    const acceptedStart = startActionRun(fresh(), "arm-gravity", 0)!;
    const accepted = finishActionRun(acceptedStart.state, "arm-gravity", acceptedStart.runId, "accepted", 2).state;
    const pendingStart = startActionRun(accepted, "reachy-wake", 3)!;
    const disconnected = disconnectActionRuns(pendingStart.state);

    expect(disconnected.reset.sort()).toEqual(["arm-gravity", "reachy-wake"]);
    for (const actionId of ACTIONS) expect(actionStatus(disconnected.state, actionId)).toBe("idle");
    expect(actionRunId(disconnected.state, "reachy-stop")).toBe(1);

    const staleAccepted = finishActionRun(disconnected.state, "arm-gravity", acceptedStart.runId, "failed", 4);
    expect(staleAccepted.status).toBeNull();
    expect(actionStatus(staleAccepted.state, "arm-gravity")).toBe("idle");

    const stalePending = finishActionRun(disconnected.state, "reachy-wake", pendingStart.runId, "accepted", 4);
    expect(stalePending.status).toBeNull();
    expect(actionStatus(stalePending.state, "reachy-wake")).toBe("idle");

    const reconnected = startActionRun(disconnected.state, "arm-gravity", 5)!;
    expect(reconnected.runId).toBeGreaterThan(acceptedStart.runId);
    expect(actionStatus(reconnected.state, "arm-gravity")).toBe("pending");
  });

  test("a pending request with no result is abandoned after the safety timeout", () => {
    expect(ACTION_PENDING_TIMEOUT_FRAMES).toBeGreaterThan(10 * 30);
    for (const actionId of ACTIONS) {
      const started = startActionRun(fresh(), actionId, 0)!;

      const before = tickActionRuns(started.state, ACTION_PENDING_TIMEOUT_FRAMES - 1);
      expect(before.expired, actionId).toEqual([]);
      expect(actionStatus(before.state, actionId), actionId).toBe("pending");

      const timeout = tickActionRuns(started.state, ACTION_PENDING_TIMEOUT_FRAMES);
      expect(timeout.expired, actionId).toEqual([actionId]);
      expect(actionStatus(timeout.state, actionId), actionId).toBe("idle");

      const late = finishActionRun(
        timeout.state,
        actionId,
        started.runId,
        "accepted",
        ACTION_PENDING_TIMEOUT_FRAMES + 1,
      );
      expect(late.status, actionId).toBeNull();
      expect(actionStatus(late.state, actionId), actionId).toBe("idle");
    }
  });

  test("unknown actions are ignored and an idle disconnect only invalidates run ids", () => {
    expect(startActionRun(fresh(), "missing-action", 0)).toBeNull();
    const disconnected = disconnectActionRuns(createActionRunStates(["reachy-stop"]));
    expect(disconnected.reset).toEqual([]);
    expect(actionStatus(disconnected.state, "reachy-stop")).toBe("idle");
    expect(actionRunId(disconnected.state, "reachy-stop")).toBe(1);
    expect(tickActionRuns(disconnected.state, 10_000).expired).toEqual([]);
  });
});
