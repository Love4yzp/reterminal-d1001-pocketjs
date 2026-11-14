import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, THEME_ORDER } from "./theme";

const UI_DIR = fileURLToPath(new URL("./ui/", import.meta.url));

describe("field-ops theme", () => {
  test("all themes expose valid 32-bit ABGR colors", () => {
    for (const id of THEME_ORDER) {
      const theme = getTheme(id);
      expect(theme.accent >>> 24).toBe(0xff);
      expect(theme.page >>> 24).toBe(0xff);
      expect(theme.critical >>> 24).toBe(0xff);
    }
  });

  test("keeps literal hex colors out of UI components", () => {
    for (const entry of readdirSync(UI_DIR)) {
      if (!entry.endsWith(".tsx")) continue;
      const source = readFileSync(join(UI_DIR, entry), "utf8");
      expect(source).not.toMatch(/0x[0-9a-fA-F]{6,8}/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
