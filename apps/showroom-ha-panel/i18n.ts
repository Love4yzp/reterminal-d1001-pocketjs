export type Language = "zh" | "en";

export const DEFAULT_LANGUAGE: Language = "zh";

export function isLanguage(value: unknown): value is Language {
  return value === "zh" || value === "en";
}

export function toggleLanguage(language: Language): Language {
  return language === "en" ? "zh" : "en";
}

/** Pick the active locale from a pair written next to the component that draws it. */
export function pick(language: Language, zh: string, en: string): string {
  return language === "en" ? en : zh;
}

/** Home and settings pill: show the language the tap switches to. */
export function languageToggleLabel(language: Language): string {
  return language === "en" ? "中文" : "EN";
}

export function languageName(language: Language): string {
  return language === "en" ? "English" : "中文";
}
