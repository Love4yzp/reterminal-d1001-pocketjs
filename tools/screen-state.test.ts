import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = resolve(root, ".pocket-build/host-tests/screen-state");

describe("D1001 native screen state", () => {
  test("C state machine passes timing and guest-independent checks", () => {
    mkdirSync(resolve(root, ".pocket-build/host-tests"), { recursive: true });
    const compile = Bun.spawnSync([
      "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
      "-I", resolve(root, "programs/reterminal-d1001/components/pocket_d1001/include"),
      resolve(root, "programs/reterminal-d1001/components/pocket_d1001/src/screen_state.c"),
      resolve(root, "programs/reterminal-d1001/components/pocket_d1001/src/screen_geometry.c"),
      resolve(root, "programs/reterminal-d1001/components/pocket_d1001/tests/screen_state_test.c"),
      "-o", output,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(compile.stderr.toString()).toBe("");
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync([output], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toBe("screen_state: all checks passed\n");
    expect(run.exitCode).toBe(0);
  });
});
