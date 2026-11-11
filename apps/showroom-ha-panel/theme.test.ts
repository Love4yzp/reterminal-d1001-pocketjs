import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { theme } from "./theme";

describe("Home Assistant dark theme", () => {
  test("uses the design's surface, text, brand and light tokens", () => {
    expect(theme).toMatchObject({
      primary: 0xfff4a903,
      brand: 0xfff2bc18,
      page: 0xff111111,
      card: 0xff1c1c1c,
      secondaryBackground: 0xff282828,
      text: 0xffe1e1e1,
      secondaryText: 0xff9b9b9b,
      disabledText: 0xff6f6f6f,
      divider: 0x1fe1e1e1,
      on: 0xff07c1ff,
      onDeep: 0xff009aff,
      tileOn: 0xff162126,
      green: 0xff50af4c,
      cardRadius: 12,
    });
  });

  test("keeps literal hex colors out of UI components", () => {
    const files = ["main.tsx", ...readdirSync(new URL("ui/", import.meta.url)).filter(name => name.endsWith(".tsx")).map(name => `ui/${name}`)];
    expect(files.length).toBeGreaterThan(5);
    for (const path of files) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
