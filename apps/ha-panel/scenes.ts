import { availableLights, type LightChanges, type LightId, type PanelAction, type PanelState } from "./model";
import { SHOWROOM, showroomScene, type SceneRunStatus, type ShowroomConfig } from "./showroom";

export type SceneId = string;

export const SCENES: readonly { id: SceneId; label: string }[] =
  SHOWROOM.home.scenes.map(key => {
    const scene = showroomScene(key)!;
    return { id: scene.key, label: scene.name };
  });

export type SceneEffect =
  | { type: "local"; sceneId: SceneId; action: PanelAction; skipped: LightId[]; appliedCount: number }
  | { type: "ha"; sceneId: SceneId; entityId: string }
  | { type: "unsupported"; sceneId: SceneId };

export function sceneEffect(
  state: PanelState,
  sceneId: SceneId,
  config: ShowroomConfig = SHOWROOM,
): SceneEffect {
  const scene = showroomScene(sceneId, config);
  if (!scene) return { type: "unsupported", sceneId };
  if (scene.kind === "ha") return { type: "ha", sceneId, entityId: scene.entityId };
  const available = availableLights(state);
  const changes: LightChanges = {};
  const skipped: LightId[] = [];
  for (const lightId of Object.keys(scene.changes)) {
    if (available.includes(lightId)) changes[lightId] = scene.changes[lightId]!;
    else skipped.push(lightId);
  }
  return {
    type: "local",
    sceneId,
    action: { type: "set-lights", changes },
    skipped,
    appliedCount: Object.keys(changes).length,
  };
}

export function sceneRunStatus(effect: SceneEffect, applied: boolean): SceneRunStatus {
  if (effect.type !== "local") return "unsupported";
  if (!applied || effect.appliedCount === 0) return "failed";
  return effect.skipped.length > 0 ? "partial" : "applied";
}

/** Compatibility seam for the original local-scene callers and tests. */
export function sceneAction(state: PanelState, scene: SceneId): PanelAction {
  const effect = sceneEffect(state, scene);
  return effect.type === "local" ? effect.action : { type: "set-lights", changes: {} };
}
