import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const component = resolve(root, "platforms/esp-idf/pocket_wifi_esp");
const output = resolve(root, ".pocket-build/host-tests/wifi-stability");

describe("D1001 Wi-Fi stability policy", () => {
  test("C policy passes unstable, weak-link and block checks", () => {
    mkdirSync(resolve(root, ".pocket-build/host-tests"), { recursive: true });
    const compile = Bun.spawnSync([
      "cc", "-std=c11", "-Wall", "-Wextra", "-Werror",
      "-I", resolve(component, "src"),
      resolve(component, "src/wifi_stability.c"),
      resolve(component, "tests/wifi_stability_test.c"),
      "-o", output,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(compile.stderr.toString()).toBe("");
    expect(compile.exitCode).toBe(0);
    const run = Bun.spawnSync([output], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.stdout.toString()).toBe("wifi_stability: all checks passed\n");
    expect(run.exitCode).toBe(0);
  });
});
