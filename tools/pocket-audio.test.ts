import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const component = resolve(root, "programs/reterminal-d1001/components/pocket_audio");
const quickjs = resolve(
  root,
  "programs/reterminal-d1001/managed_components/espressif__quickjs-ng/quickjs-ng",
);
const hostTests = resolve(root, ".pocket-build/host-tests");

describe("D1001 audio mixer core", () => {
  test("C state machine, ring, credit, tick latch and mixing checks pass", () => {
    mkdirSync(hostTests, { recursive: true });
    const output = resolve(hostTests, "pocket-audio-core");
    const compile = Bun.spawnSync([
      "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
      "-I", resolve(component, "src"),
      resolve(component, "src/pocket_audio_core.c"),
      resolve(component, "tests/pocket_audio_core_test.c"),
      "-o", output,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(compile.stderr.toString()).toBe("");
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync([output], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toBe("pocket_audio_core: all checks passed\n");
    expect(run.exitCode).toBe(0);
  });

  const hasQuickjs = existsSync(resolve(quickjs, "quickjs.c"));
  (hasQuickjs ? test : test.skip)(
    "QuickJS argument failures propagate as exceptions",
    () => {
    mkdirSync(hostTests, { recursive: true });
    const quickjsBuild = resolve(hostTests, "quickjs");
    mkdirSync(quickjsBuild, { recursive: true });
    const objects: string[] = [];
    for (const name of ["quickjs", "dtoa", "libregexp", "libunicode"]) {
      const object = resolve(quickjsBuild, `${name}.o`);
      const compile = Bun.spawnSync([
        "cc", "-std=c11", "-O0", "-w", "-DQUICKJS_NG_BUILD", "-D_GNU_SOURCE",
        "-I", quickjs, "-c", resolve(quickjs, `${name}.c`), "-o", object,
      ], { cwd: root, stdout: "pipe", stderr: "pipe" });
      expect(compile.stderr.toString()).toBe("");
      expect(compile.exitCode).toBe(0);
      objects.push(object);
    }
    const output = resolve(hostTests, "pocket-audio-args");
    const compile = Bun.spawnSync([
      "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
      "-I", resolve(component, "src"), "-I", quickjs,
      resolve(component, "src/pocket_audio_args.c"),
      resolve(component, "tests/pocket_audio_args_test.c"),
      ...objects, "-lm", "-lpthread", "-o", output,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(compile.stderr.toString()).toBe("");
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync([output], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toBe("pocket_audio_args: all checks passed\n");
    expect(run.exitCode).toBe(0);
    },
  );
});
