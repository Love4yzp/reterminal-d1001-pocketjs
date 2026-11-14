import type { Language } from "./i18n";
import { INITIAL_TAB, TABS, type Tab } from "./navigation";
import type { OpsProfileId } from "./protocol";
import { SCREEN_OFF_OPTIONS, type SettingsState } from "./settings";
import { THEME_ORDER, type ThemeId } from "./theme";

export interface OpsSessionSnapshot {
  version: 1;
  tab: Tab;
  themeId: ThemeId;
  language: Language;
  profileId: OpsProfileId;
  muted: boolean;
  screenOffSeconds: number;
}

const VALID_TABS = new Set<string>(TABS.map(t => t.id));
const VALID_THEMES = new Set<string>(THEME_ORDER);
const VALID_PROFILES = new Set<string>(["ess", "charger", "lorawan"]);
const VALID_SCREEN_OFF = new Set<number>(SCREEN_OFF_OPTIONS.map(o => o.seconds));

export function encodeSession(
  tab: Tab,
  themeId: ThemeId,
  language: Language,
  profileId: OpsProfileId,
  muted: boolean,
  settings: SettingsState,
): string {
  const payload: OpsSessionSnapshot = {
    version: 1,
    tab,
    themeId,
    language,
    profileId,
    muted,
    screenOffSeconds: settings.screenOffSeconds,
  };
  return JSON.stringify(payload);
}

export function decodeSession(raw: string): OpsSessionSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OpsSessionSnapshot>;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) return null;
    const tab: Tab = typeof parsed.tab === "string" && VALID_TABS.has(parsed.tab)
      ? (parsed.tab as Tab)
      : INITIAL_TAB;
    const themeId: ThemeId = typeof parsed.themeId === "string" && VALID_THEMES.has(parsed.themeId)
      ? (parsed.themeId as ThemeId)
      : "cobalt";
    const language: Language = parsed.language === "en" ? "en" : "zh";
    const profileId: OpsProfileId = typeof parsed.profileId === "string" && VALID_PROFILES.has(parsed.profileId)
      ? (parsed.profileId as OpsProfileId)
      : "ess";
    const screenOffSeconds = typeof parsed.screenOffSeconds === "number" && VALID_SCREEN_OFF.has(parsed.screenOffSeconds)
      ? parsed.screenOffSeconds
      : 0;
    return {
      version: 1,
      tab,
      themeId,
      language,
      profileId,
      muted: parsed.muted === true,
      screenOffSeconds,
    };
  } catch {
    return null;
  }
}
