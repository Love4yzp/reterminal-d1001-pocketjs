import { createInitialPanelState, reducePanel, type PanelState } from "./model";

export function connectedState(): PanelState {
  const pending = reducePanel(createInitialPanelState(), {
    type: "ha", haConfigured: true, haConnected: true, haLightConfigured: true,
  });
  return reducePanel(pending, {
    type: "entity-light",
    lightId: "remote",
    light: { on: true, brightness: 255, hue: 0, saturation: 100 },
    updatedAt: 100,
  });
}
