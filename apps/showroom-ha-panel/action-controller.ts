import type { ActionRunStatus } from "./showroom";

/** Three seconds at tickHz=30: accepted and failed feedback expires on this frame. */
export const ACTION_FEEDBACK_FRAMES = 90;

/**
 * Safety timeout for a request whose result never arrives. The worker's HTTP
 * timeout is 10 s; 15 s at 30 Hz leaves room for a late result before the UI
 * re-opens an arm button.
 */
export const ACTION_PENDING_TIMEOUT_FRAMES = 450;

export interface ActionRunState {
  runId: number;
  status: ActionRunStatus;
  /** Frame on which accepted/failed feedback must return to idle. */
  feedbackUntil: number | null;
  /** Frame on which a pending request is abandoned if no result arrived. */
  pendingUntil: number | null;
}

export type ActionRunStates = Record<string, ActionRunState>;

export function createActionRunStates(actionIds: readonly string[]): ActionRunStates {
  const states: ActionRunStates = {};
  for (const actionId of actionIds)
    states[actionId] = { runId: 0, status: "idle", feedbackUntil: null, pendingUntil: null };
  return states;
}

function replace(state: ActionRunStates, actionId: string, run: ActionRunState): ActionRunStates {
  return { ...state, [actionId]: run };
}

export function actionStatus(state: ActionRunStates, actionId: string): ActionRunStatus {
  return state[actionId]?.status ?? "idle";
}

export function actionRunId(state: ActionRunStates, actionId: string): number {
  return state[actionId]?.runId ?? 0;
}

export interface StartActionResult {
  state: ActionRunStates;
  runId: number;
}

/** Start a request and invalidate every earlier run for the same button. */
export function startActionRun(
  state: ActionRunStates,
  actionId: string,
  frame: number,
): StartActionResult | null {
  const current = state[actionId];
  if (!current) return null;
  const runId = current.runId + 1;
  return {
    state: replace(state, actionId, {
      runId,
      status: "pending",
      feedbackUntil: null,
      pendingUntil: frame + ACTION_PENDING_TIMEOUT_FRAMES,
    }),
    runId,
  };
}

export interface FinishActionResult {
  state: ActionRunStates;
  /** The accepted status, or null when the result belongs to an older run. */
  status: "accepted" | "failed" | null;
}

/** Apply the single result for the latest run; duplicate and late results are ignored. */
export function finishActionRun(
  state: ActionRunStates,
  actionId: string,
  runId: number,
  status: "accepted" | "failed",
  frame: number,
): FinishActionResult {
  const current = state[actionId];
  if (!current || current.runId !== runId || current.status !== "pending")
    return { state, status: null };
  return {
    state: replace(state, actionId, {
      ...current,
      status,
      feedbackUntil: frame + ACTION_FEEDBACK_FRAMES,
      pendingUntil: null,
    }),
    status,
  };
}

export interface ActionTickResult {
  state: ActionRunStates;
  expired: string[];
}

/**
 * Advance feedback and abandoned-request timers. Frame 89 of a 90-frame
 * window still shows feedback; frame 90 returns idle and invalidates the run.
 */
export function tickActionRuns(state: ActionRunStates, frame: number): ActionTickResult {
  let next = state;
  const expired: string[] = [];
  for (const actionId of Object.keys(state)) {
    const run = state[actionId]!;
    const feedbackExpired = (run.status === "accepted" || run.status === "failed") &&
      run.feedbackUntil !== null && frame >= run.feedbackUntil;
    const pendingExpired = run.status === "pending" &&
      run.pendingUntil !== null && frame >= run.pendingUntil;
    if (!feedbackExpired && !pendingExpired) continue;
    if (next === state) next = { ...state };
    next[actionId] = { runId: run.runId + 1, status: "idle", feedbackUntil: null, pendingUntil: null };
    expired.push(actionId);
  }
  return { state: next, expired };
}

export interface ActionDisconnectResult {
  state: ActionRunStates;
  reset: string[];
}

/**
 * Clear every active run when HA disconnects. All runIds advance so a result
 * that arrives after reconnection is ignored.
 */
export function disconnectActionRuns(state: ActionRunStates): ActionDisconnectResult {
  const next: ActionRunStates = {};
  const reset: string[] = [];
  for (const [actionId, run] of Object.entries(state)) {
    if (run.status !== "idle") reset.push(actionId);
    next[actionId] = { runId: run.runId + 1, status: "idle", feedbackUntil: null, pendingUntil: null };
  }
  return { state: next, reset };
}
