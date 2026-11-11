import { brightnessFromPercent } from "./dimmer";
import { availableLights, type LightChanges, type LightId, type LightState, type PanelAction, type PanelState } from "./model";

export type SceneId = "all-off" | "night" | "reading";

export const SCENES: readonly { id: SceneId; label: string }[] = [
  { id: "all-off", label: "全部关闭" },
  { id: "night", label: "夜间模式" },
  { id: "reading", label: "阅读" },
];

const OFF: Partial<LightState> = { on: false };
const lit = (percent: number, hue: number, saturation: number): Partial<LightState> =>
  ({ on: true, brightness: brightnessFromPercent(percent), hue, saturation });

const NIGHT = lit(10, 30, 85);
const SCENE_LIGHTS: Record<SceneId, Record<LightId, Partial<LightState>>> = {
  "all-off": { desk: OFF, shelf: OFF, onboard: OFF, remote: OFF },
  night: { desk: OFF, shelf: NIGHT, onboard: NIGHT, remote: NIGHT },
  reading: { desk: lit(100, 37, 12), shelf: lit(60, 37, 12), onboard: OFF, remote: lit(80, 37, 12) },
};

/** One batch action for a scene, covering only the lights that can respond right now. */
export function sceneAction(state: PanelState, scene: SceneId): PanelAction {
  const changes: LightChanges = {};
  for (const lightId of availableLights(state)) changes[lightId] = SCENE_LIGHTS[scene][lightId];
  return { type: "set-lights", changes };
}
