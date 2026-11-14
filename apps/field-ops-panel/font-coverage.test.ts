import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPS_ROOT, collectAppCharacters, sortedCharacters } from "./fonts/tool";

describe("field-ops font coverage", () => {
  test("declares every CJK character used by source files", () => {
    const expected = sortedCharacters(collectAppCharacters(OPS_ROOT));
    const actual = readFileSync(join(OPS_ROOT, "fonts/characters.txt"), "utf8").trim();
    expect(actual).toBe(expected);
  });
});
