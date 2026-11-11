import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectAppCharacters, HA_PANEL_ROOT, sortedCharacters, sourceCharacters } from "../../tools/ha-panel-fonts";

describe("ha-panel packaged font coverage", () => {
  test("declares every CJK character and full-width punctuation used by the source", () => {
    const config = JSON.parse(readFileSync(join(HA_PANEL_ROOT, "fonts.json"), "utf8"));
    expect(config.fallback).toEqual(["fonts/D1001SansSC-Regular.otf"]);
    expect(config.characterFiles).toEqual(["fonts/characters.txt"]);
    for (const path of [...config.fallback, ...config.characterFiles])
      expect(existsSync(join(HA_PANEL_ROOT, path))).toBe(true);
    const declared = new Set(readFileSync(join(HA_PANEL_ROOT, "fonts/characters.txt"), "utf8"));
    const missing = sortedCharacters(new Set([...collectAppCharacters()].filter(character => !declared.has(character))));
    expect(missing).toBe("");
  });

  test("extracts CJK text from string literals, templates and JSX", () => {
    expect(sortedCharacters(sourceCharacters("const a = '时间'; const b = `温度${1}°`; const c = <Text>演示数据</Text>;")))
      .toBe("度据数时温演示间");
  });
});
