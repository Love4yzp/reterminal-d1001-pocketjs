import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const productionFiles = [
  "main.tsx",
  "model.ts",
  "showroom.ts",
  "ui/home-screen.tsx",
  "ui/landscape-screen.tsx",
  "ui/showroom-cards.tsx",
  "ui/console-controls.tsx",
];

describe("showroom console UI", () => {
  test("has no user-facing scenes or local scene execution state", () => {
    for (const path of productionFiles) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source, path).not.toMatch(/场景|Scenes|SceneButton|sceneRuns|home\.scenes|onScene/);
    }
  });

  test("uses the existing dimmer intent without a home preset grid", () => {
    const controls = readFileSync(new URL("ui/console-controls.tsx", import.meta.url), "utf8");
    const main = readFileSync(new URL("main.tsx", import.meta.url), "utf8");
    const input = readFileSync(new URL("input.ts", import.meta.url), "utf8");
    const shots = readFileSync(new URL("../../tools/ha-panel-preview-shots.ts", import.meta.url), "utf8");
    expect(controls).not.toContain("LightPresetControls");
    expect(controls).toContain("box={props.box}");
    expect(controls).toContain('onTap={() => powerIntent("tap")}');
    expect(controls).toContain('onLongPress={() => powerIntent("long-press")}');
    expect(main).toContain('tileIntent(details ? "long-press" : "tap"');
    expect(main).not.toContain("LIGHT_OPTION_IDS");
    expect(input).not.toContain('"light-option"');
    expect(shots).not.toContain('name: "dimmer-detail"');
    expect(shots).toContain('name: "dimmer-drag"');
    expect(shots).toContain('name: "dimmer-preset"');
    for (const name of ["brightness-25", "color-warm", "color-blue"]) expect(shots).not.toContain(`name: "${name}"`);
  });
});
