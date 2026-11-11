import type { PanelHaConfig } from "./protocol";

/**
 * Build-time override for private deployments. The committed app is intentionally
 * unconfigured; local deployment tooling replaces this module in a temporary copy.
 */
export const LOCAL_HA_CONFIG: PanelHaConfig | undefined = undefined;
