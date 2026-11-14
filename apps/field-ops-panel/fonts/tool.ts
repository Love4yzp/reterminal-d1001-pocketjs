import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const OPS_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHARACTER_PATTERN = /[\u00b0\u2103\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/gu;
const TEXT_PATTERN = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|>[^<>]+</gs;

export function sourceCharacters(source: string): Set<string> {
  const characters = new Set<string>();
  for (const match of source.matchAll(TEXT_PATTERN))
    for (const character of match[0].matchAll(CHARACTER_PATTERN)) characters.add(character[0]);
  return characters;
}

export function collectAppCharacters(root = OPS_ROOT): Set<string> {
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

const FONT_SOURCE = "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc";

/** Rebuild fonts/D1001SansSC-Regular.otf from characters.txt (byte-deterministic). */
export function rebuildSubset(root = OPS_ROOT) {
  const result = Bun.spawnSync([
    "mise", "x", "uv", "--", "uvx", "--from", "fonttools", "pyftsubset", FONT_SOURCE,
    "--font-number=2",
    `--text-file=${join(root, "fonts/characters.txt")}`,
    `--output-file=${join(root, "fonts/D1001SansSC-Regular.otf")}`,
    "--name-IDs=*", "--name-legacy", "--name-languages=*",
    "--notdef-outline", "--recommended-glyphs",
  ], { stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(`pyftsubset failed\n${result.stdout}${result.stderr}`);
}

if (import.meta.main) {
  const path = join(OPS_ROOT, "fonts/characters.txt");
  const expected = sortedCharacters(collectAppCharacters());
  const actual = existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  if (process.argv.includes("--check")) {
    if (actual !== expected) throw new Error("field-ops-panel character coverage is stale; run bun run ops:fonts");
    console.log(`field-ops-panel font coverage: ${[...expected].length} characters`);
  } else {
    const changed = actual !== expected;
    if (changed) writeFileSync(path, `${expected}\n`);
    if (changed || process.argv.includes("--force") || !existsSync(join(OPS_ROOT, "fonts/D1001SansSC-Regular.otf"))) {
      rebuildSubset();
      console.log(`field-ops-panel fonts: ${[...expected].length} characters, subset rebuilt`);
    } else {
      console.log(`field-ops-panel fonts: ${[...expected].length} characters, unchanged`);
    }
  }
}
