// PocketJS colors are 0xAABBGGRR (byte-reversed CSS hex).
export type ThemeId = "cobalt" | "emerald" | "amber";

export interface OpsTheme {
  readonly id: ThemeId;
  readonly page: number;
  readonly card: number;
  readonly cardElevated: number;
  readonly text: number;
  readonly secondaryText: number;
  readonly disabledText: number;
  readonly divider: number;
  readonly accent: number;
  readonly accentChip: number;
  readonly ok: number;
  readonly okChip: number;
  readonly warn: number;
  readonly warnChip: number;
  readonly critical: number;
  readonly criticalChip: number;
  readonly white: number;
  readonly cardRadius: number;
  readonly tileRadius: number;
}

const SHARED = {
  page: 0xff101317,
  card: 0xff1a1f26,
  cardElevated: 0xff242b35,
  text: 0xffe8ecf2,
  secondaryText: 0xff9aa5b4,
  disabledText: 0xff657080,
  divider: 0x22e8ecf2,
  ok: 0xff6ad146, // #46d16a
  okChip: 0x336ad146,
  warn: 0xff19b3ff, // #ffb319
  warnChip: 0x3319b3ff,
  critical: 0xff5252ff, // #ff5252
  criticalChip: 0x335252ff,
  white: 0xffffffff,
  cardRadius: 12,
  tileRadius: 10,
} as const;

export const THEMES: Record<ThemeId, OpsTheme> = {
  cobalt: {
    id: "cobalt",
    ...SHARED,
    accent: 0xfff4a903, // #03a9f4
    accentChip: 0x33f4a903,
  },
  emerald: {
    id: "emerald",
    ...SHARED,
    page: 0xff121512,
    card: 0xff1a221c,
    cardElevated: 0xff243027,
    accent: 0xff9cd924, // #24d99c
    accentChip: 0x339cd924,
  },
  amber: {
    id: "amber",
    ...SHARED,
    page: 0xff111214,
    card: 0xff1d1d21,
    cardElevated: 0xff2a292f,
    accent: 0xff1cc4ff, // #ffc41c
    accentChip: 0x331cc4ff,
  },
};

export const THEME_ORDER: readonly ThemeId[] = ["cobalt", "emerald", "amber"];

export function getTheme(id: ThemeId): OpsTheme {
  return THEMES[id] ?? THEMES.cobalt;
}
