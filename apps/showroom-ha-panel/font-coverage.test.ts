import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bakeAtlases } from "../../third_party/pocketjs/framework/compiler/bake-font";
import { FONT_CMAP_ENTRY_SIZE, FONT_HEADER_SIZE } from "../../third_party/pocketjs/contracts/spec/spec";
import { compileClasses } from "../../third_party/pocketjs/framework/compiler/tailwind";
import { collectAppCharacters, SHOWROOM_ROOT, sortedCharacters, sourceCharacters } from "./fonts/tool";

function appSources(directory = SHOWROOM_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "fonts" || entry.name.startsWith(".")) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSources(path);
    return /\.tsx?$/.test(entry.name) ? [readFileSync(path, "utf8")] : [];
  });
}

function activeFontSlots(): number[] {
  const literals = appSources().flatMap(source =>
    [...source.matchAll(/["'`]((?:absolute|relative|grow|flex-)[^"'`]*)["'`]/g)].map(match => match[1]!));
  return compileClasses(literals).usedFontSlots;
}

function atlasCodepoints(bytes: Uint8Array): Set<number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(6, true);
  const codepoints = new Set<number>();
  for (let index = 0; index < count; index += 1)
    codepoints.add(view.getUint32(FONT_HEADER_SIZE + index * FONT_CMAP_ENTRY_SIZE, true));
  return codepoints;
}

describe("showroom-ha-panel packaged font coverage", () => {
  test("declares every CJK character and full-width punctuation used by the source", () => {
    const config = JSON.parse(readFileSync(join(SHOWROOM_ROOT, "fonts.json"), "utf8"));
    expect(config.fallback).toEqual(["fonts/D1001SansSC-Regular.otf"]);
    expect(config.characterFiles).toEqual(["fonts/characters.txt"]);
    for (const path of [...config.fallback, ...config.characterFiles])
      expect(existsSync(join(SHOWROOM_ROOT, path))).toBe(true);
    const declared = new Set(readFileSync(join(SHOWROOM_ROOT, "fonts/characters.txt"), "utf8"));
    const missing = sortedCharacters(new Set([...collectAppCharacters()].filter(character => !declared.has(character))));
    expect(missing).toBe("");
  });

  test("bakes every collected character into every active size and weight atlas", async () => {
    const required = collectAppCharacters();
    const atlases = await bakeAtlases({
      codepoints: [...required].map(character => character.codePointAt(0)!),
      slots: activeFontSlots(),
      rasterDensity: 2,
      fallbackTtfs: [join(SHOWROOM_ROOT, "fonts/D1001SansSC-Regular.otf")],
    });
    for (const atlas of atlases) {
      const actual = atlasCodepoints(atlas.bytes);
      const missing = sortedCharacters(new Set([...required].filter(character => !actual.has(character.codePointAt(0)!))));
      expect({ slot: atlas.slot, px: atlas.px, bold: atlas.bold, missing }).toEqual({
        slot: atlas.slot, px: atlas.px, bold: atlas.bold, missing: "",
      });
    }
  }, 30_000);

  test("extracts CJK text from string literals, templates and JSX", () => {
    expect(sortedCharacters(sourceCharacters("const a = '时间'; const b = `温度${1}°`; const c = <Text>演示数据</Text>;")))
      .toBe("度据数时温演示间");
  });
});
