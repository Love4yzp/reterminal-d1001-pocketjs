import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const HA_PANEL_ROOT = fileURLToPath(new URL("../apps/ha-panel/", import.meta.url));
const CHARACTER_PATTERN = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/gu;
const TEXT_PATTERN = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|>[^<>]+</gs;

export function sourceCharacters(source: string): Set<string> {
  const characters = new Set<string>();
  for (const match of source.matchAll(TEXT_PATTERN))
    for (const character of match[0].matchAll(CHARACTER_PATTERN)) characters.add(character[0]);
  return characters;
}

export function collectAppCharacters(root = HA_PANEL_ROOT): Set<string> {
  const characters = new Set<string>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "fonts" || entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/.test(entry.name))
        for (const character of sourceCharacters(readFileSync(path, "utf8"))) characters.add(character);
    }
  };
  visit(root);
  return characters;
}

export function sortedCharacters(characters: ReadonlySet<string>): string {
  return [...characters].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join("");
}

if (import.meta.main) {
  const path = join(HA_PANEL_ROOT, "fonts/characters.txt");
  const expected = sortedCharacters(collectAppCharacters());
  if (process.argv.includes("--check")) {
    const actual = readFileSync(path, "utf8").trim();
    if (actual !== expected) throw new Error("ha-panel character coverage is stale; run bun tools/ha-panel-fonts.ts");
    console.log(`ha-panel font coverage: ${[...expected].length} characters`);
  } else {
    writeFileSync(path, `${expected}\n`);
    console.log(`wrote ${[...expected].length} characters to ${path}`);
  }
}
