import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { theme } from "./theme";

describe("Home Assistant dark theme", () => {
  test("uses the dark surface, text, brand and light tokens", () => {
    expect(theme).toMatchObject({
      primary: 0xfff4a903,
      brand: 0xfff2bc18,
      page: 0xff111111,
      card: 0xff1c1c1c,
      text: 0xffe1e1e1,
      secondaryText: 0xff9b9b9b,
      divider: 0x1fe1e1e1,
      lightActive: 0xff07c1ff,
      cardRadius: 12,
    });
  });

  test("keeps literal hex colors out of UI components", () => {
    for (const path of ["main.tsx", "ui/cards.tsx", "ui/lights.tsx", "ui/controls.tsx"]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
