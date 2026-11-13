import { describe, expect, test } from "bun:test";

import { DEFAULT_LANGUAGE, isLanguage, languageName, languageToggleLabel, pick, toggleLanguage } from "./i18n";

describe("panel language", () => {
  test("defaults to Chinese, toggles both ways and rejects unknown values", () => {
    expect(DEFAULT_LANGUAGE).toBe("zh");
    expect(toggleLanguage("zh")).toBe("en");
    expect(toggleLanguage("en")).toBe("zh");
    expect(isLanguage("zh")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });

  test("offers the target language on the toggle and prints the active language", () => {
    expect(languageToggleLabel("zh")).toBe("EN");
    expect(languageToggleLabel("en")).toBe("中文");
    expect(languageName("zh")).toBe("中文");
    expect(languageName("en")).toBe("English");
    expect(pick("zh", "温度", "Temperature")).toBe("温度");
    expect(pick("en", "温度", "Temperature")).toBe("Temperature");
  });
});
