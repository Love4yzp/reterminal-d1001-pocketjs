import type { WorkerCommand } from "../apps/field-ops-panel/protocol";

export type Touch = readonly [number, number] | null;
export interface Shot {
  name: string;
  tape: readonly { frames: number; touch: Touch }[];
  verify?(commands: readonly WorkerCommand[]): void;
}

const tap = (x: number, y: number) => [{ frames: 2, touch: [x, y] as const }, { frames: 2, touch: null }];

export const PORTRAIT_SHOTS: { live: Shot[]; offline: Shot[] } = {
  live: [
    { name: "overview", tape: [] },
    { name: "overview-en", tape: [...tap(318, 16)] },
    {
      name: "control",
      tape: [...tap(150, 608), ...tap(270, 126), ...tap(328, 332)],
    },
    {
      name: "control-confirmed",
      tape: [...tap(150, 608), ...tap(270, 126), ...tap(328, 332), ...tap(200, 404), { frames: 8, touch: null }],
      verify(commands) {
        const setpoint = commands.find(c => c.type === "setpoint");
        if (!setpoint || setpoint.type !== "setpoint" || setpoint.mode !== "boost" || setpoint.targetKw !== 45) {
          throw new Error(`expected setpoint(boost, 45), got ${JSON.stringify(commands)}`);
        }
      },
    },
    {
      name: "alarms",
      tape: [...tap(250, 608)],
    },
    {
      name: "alarms-acked",
      tape: [...tap(250, 608), ...tap(340, 118), { frames: 8, touch: null }],
      verify(commands) {
        const ack = commands.find(c => c.type === "ack-alarm");
        if (!ack || ack.type !== "ack-alarm") {
          throw new Error(`expected ack-alarm command, got ${JSON.stringify(commands)}`);
        }
      },
    },
    {
      name: "system",
      tape: [...tap(350, 608)],
    },
    {
      name: "theme-emerald",
      tape: [...tap(350, 608), ...tap(200, 124), ...tap(50, 608)],
    },
    {
      name: "lorawan-overview",
      tape: [...tap(350, 608), ...tap(316, 212), { frames: 6, touch: null }, ...tap(50, 608)],
      verify(commands) {
        const prof = commands.find(c => c.type === "set-profile" && c.profileId === "lorawan");
        if (!prof) throw new Error(`expected set-profile(lorawan), got ${JSON.stringify(commands)}`);
      },
    },
  ],
  offline: [
    { name: "overview", tape: [] },
    { name: "control", tape: [...tap(150, 608)] },
  ],
};

export const LANDSCAPE_SHOTS: { live: Shot[]; offline: Shot[] } = {
  live: [
    { name: "overview", tape: [] },
    { name: "control", tape: [...tap(44, 166)] },
    { name: "alarms", tape: [...tap(44, 248)] },
    { name: "system", tape: [...tap(44, 330)] },
    {
      name: "lorawan-overview",
      tape: [...tap(44, 330), ...tap(308, 128), { frames: 6, touch: null }, ...tap(44, 84)],
    },
  ],
  offline: [
    { name: "overview", tape: [] },
  ],
};
