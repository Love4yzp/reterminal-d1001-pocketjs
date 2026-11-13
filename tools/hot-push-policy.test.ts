import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const component = resolve(root, "platforms/esp-idf/pocket_hot_push_esp");
const main = resolve(root, "programs/reterminal-d1001/main");
const hostTests = resolve(root, ".pocket-build/host-tests");

describe("D1001 hot push recovery", () => {
  test("write failure still recovers and reports the right outcome", () => {
    mkdirSync(hostTests, { recursive: true });
    const output = resolve(hostTests, "hot-push-policy");
    const compile = Bun.spawnSync([
      "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
      "-I", resolve(component, "src"),
      resolve(component, "src/d1001_hot_push_policy.c"),
      resolve(component, "tests/d1001_hot_push_policy_test.c"),
      "-o", output,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(compile.stderr.toString()).toBe("");
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync([output], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toBe("d1001_hot_push_policy: all checks passed\n");
    expect(run.exitCode).toBe(0);
  });

  test("stop, write-failure recovery, restart failure and landscape fallback", () => {
    mkdirSync(hostTests, { recursive: true });
    const output = resolve(hostTests, "hot-state");
    const compile = Bun.spawnSync([
      "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
      "-I", main,
      resolve(main, "tests/hot_state_test.c"),
      "-o", output,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(compile.stderr.toString()).toBe("");
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync([output], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toBe("d1001_hot_state: all checks passed\n");
    expect(run.exitCode).toBe(0);
  });
});
