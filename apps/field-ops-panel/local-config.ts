import { file, fsHost, write } from "@pocketjs/framework/fs";
import type { Language } from "./i18n";
import type { OpsConfig, OpsProfileId, OpsTelemetrySnapshot } from "./protocol";
import { THEME_ORDER, type ThemeId } from "./theme";

export const OPS_CONFIG_PATH = "ops-config.json";
export const OPS_PREFS_PATH = "ops-prefs.json";
export const OPS_CACHE_PATH = "ops-cache.json";

export interface OpsPrefs {
  themeId: ThemeId;
  language: Language;
  muted: boolean;
  profileId?: OpsProfileId;
}

export interface OpsCachedData {
  snapshot: OpsTelemetrySnapshot;
  receivedEpoch: number;
}

const VALID_PROFILES = new Set<string>(["ess", "charger", "lorawan"]);
const VALID_THEMES = new Set<string>(THEME_ORDER);

function shortError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 80);
}

export function parseOpsConfig(source: string): OpsConfig {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("ops-config.json must be a JSON object");
  if (parsed.version !== 1) throw new Error("ops-config.json unsupported version");
  const baseUrl = typeof parsed.baseUrl === "string" ? parsed.baseUrl.replace(/\/+$/, "") : "";
  const token = typeof parsed.token === "string" ? parsed.token : "";
  if (!baseUrl || !token) throw new Error("ops-config.json requires baseUrl and token");
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("ops-config.json baseUrl must be http(s)");
  const profileId = typeof parsed.profileId === "string" && VALID_PROFILES.has(parsed.profileId)
    ? (parsed.profileId as OpsProfileId)
    : "ess";
  const staleAfterSeconds = typeof parsed.staleAfterSeconds === "number" && parsed.staleAfterSeconds >= 5
    ? Math.round(parsed.staleAfterSeconds)
    : 30;
  const pollIntervalMs = typeof parsed.pollIntervalMs === "number" && parsed.pollIntervalMs >= 1000
    ? Math.round(parsed.pollIntervalMs)
    : 3000;
  return { baseUrl, token, profileId, staleAfterSeconds, pollIntervalMs, configError: "" };
}

export function readLocalOpsConfig(): OpsConfig {
  if (!fsHost()) {
    return { baseUrl: "", token: "", profileId: "ess", staleAfterSeconds: 30, pollIntervalMs: 3000, configError: "" };
  }
  try {
    const saved = file(OPS_CONFIG_PATH);
    if (!saved.exists()) {
      return { baseUrl: "", token: "", profileId: "ess", staleAfterSeconds: 30, pollIntervalMs: 3000, configError: "" };
    }
    return parseOpsConfig(saved.text());
  } catch (error) {
    return {
      baseUrl: "",
      token: "",
      profileId: "ess",
      staleAfterSeconds: 30,
      pollIntervalMs: 3000,
      configError: shortError(error),
    };
  }
}

export function readLocalPrefs(): OpsPrefs | null {
  if (!fsHost()) return null;
  try {
    const saved = file(OPS_PREFS_PATH);
    if (!saved.exists()) return null;
    const parsed = JSON.parse(saved.text()) as Partial<OpsPrefs>;
    const themeId = typeof parsed.themeId === "string" && VALID_THEMES.has(parsed.themeId)
      ? (parsed.themeId as ThemeId)
      : "cobalt";
    const language: Language = parsed.language === "en" ? "en" : "zh";
    const profileId = typeof parsed.profileId === "string" && VALID_PROFILES.has(parsed.profileId)
      ? (parsed.profileId as OpsProfileId)
      : undefined;
    return { themeId, language, muted: parsed.muted === true, profileId };
  } catch {
    return null;
  }
}

export function writeLocalPrefs(prefs: OpsPrefs): void {
  if (!fsHost()) return;
  try {
    write(OPS_PREFS_PATH, `${JSON.stringify(prefs)}\n`);
  } catch {
    // Ignore storage write errors so UI stays responsive.
  }
}

export function readLocalCache(): OpsCachedData | null {
  if (!fsHost()) return null;
  try {
    const saved = file(OPS_CACHE_PATH);
    if (!saved.exists()) return null;
    const parsed = JSON.parse(saved.text()) as Partial<OpsCachedData>;
    if (!parsed || typeof parsed.receivedEpoch !== "number" || !parsed.snapshot) return null;
    return { snapshot: parsed.snapshot, receivedEpoch: parsed.receivedEpoch };
  } catch {
    return null;
  }
}

export function writeLocalCache(cache: OpsCachedData): void {
  if (!fsHost()) return;
  try {
    write(OPS_CACHE_PATH, `${JSON.stringify(cache)}\n`);
  } catch {
    // Ignore cache write errors so UI stays responsive.
  }
}
