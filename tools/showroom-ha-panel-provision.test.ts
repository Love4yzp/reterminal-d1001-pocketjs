import { describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import {
  assertInstalledImage,
  assertPrivateFile,
  assertTmpfsPath,
  assertTokenAbsent,
  assertTrailingErased,
  eraseAppsCommand,
  hasVerificationMarker,
  packageExtent,
  parseOptions,
  prepareOutput,
  privatizeTree,
  seedIdForConfig,
} from "./showroom-ha-panel-provision";

describe("showroom provisioning CLI and PKAP extent", () => {
  test("requires explicit seed/out and exactly one phase", () => {
    expect(() => parseOptions([])).toThrow("required");
    expect(() => parseOptions(["--seed", "x", "--out", "y"])).toThrow("exactly one");
    expect(() => parseOptions(["--seed", "x", "--out", "y", "--push-seed", "--finish"])).toThrow("exactly one");
    expect(() => parseOptions(["--seed", "x", "--out", "y", "--wat"])).toThrow("unknown option");
    expect(() => parseOptions(["--seed", "x", "--out", "y", "--finish", "--verify-log", "z"]))
      .toThrow("reject-token-file");
    expect(parseOptions([
      "--seed", "x", "--out", "y", "--finish", "--verify-log", "z", "--reject-token-file", "token",
    ]).rejectTokenFiles).toHaveLength(1);
  });

  test("includes the 64-byte header and accepts the exact apps boundary", () => {
    expect(packageExtent(1)).toBe(65_536);
    expect(packageExtent(0x700000 - 64)).toBe(0x700000);
    expect(packageExtent(0x700000 - 63)).toBe(0x710000);
  });
});

describe("showroom provisioning security gates", () => {
  test("rejects /dev/shm itself, aliases to its root, non-tmpfs and repository paths", () => {
    const alias = `/dev/shm/showroom-root-alias-${process.pid}`;
    symlinkSync("/dev/shm", alias);
    try {
      expect(() => assertTmpfsPath("/dev/shm")).toThrow("not its root");
      expect(() => assertTmpfsPath(alias)).toThrow("not its root");
      expect(() => assertTmpfsPath("/dev/shm/showroom-test/config.json")).not.toThrow();
      expect(() => assertTmpfsPath("/tmp/showroom-test/config.json")).toThrow("tmpfs");
      expect(() => assertTmpfsPath(".pocket-build/config.json")).toThrow("repository");
    } finally {
      rmSync(alias, { force: true });
    }
  });

  test("creates only fresh output and resumes only its own symlink-free directory", () => {
    const parent = `/dev/shm/showroom-output-parent-${process.pid}`;
    const unowned = `${parent}/unowned`;
    const owned = `${parent}/owned`;
    mkdirSync(unowned, { recursive: true, mode: 0o700 });
    try {
      expect(() => prepareOutput(unowned)).toThrow("unowned");
      prepareOutput(owned);
      expect(() => prepareOutput(owned)).not.toThrow();
      symlinkSync("/tmp", `${owned}/redirect`);
      expect(() => prepareOutput(owned)).toThrow();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("requires private regular secret files", () => {
    const directory = `/dev/shm/showroom-provision-test-${process.pid}`;
    mkdirSync(directory, { mode: 0o700 });
    const secret = `${directory}/secret`;
    try {
      writeFileSync(secret, "secret", { mode: 0o600 });
      expect(() => assertPrivateFile(secret)).not.toThrow();
      chmodSync(secret, 0o644);
      expect(() => assertPrivateFile(secret)).toThrow("group/other");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("privatizes every generated seed artifact", () => {
    const directory = `/dev/shm/showroom-provision-tree-${process.pid}`;
    const nested = `${directory}/build`;
    const artifact = `${nested}/seed.js`;
    mkdirSync(nested, { recursive: true, mode: 0o755 });
    writeFileSync(artifact, "secret", { mode: 0o644 });
    try {
      privatizeTree(directory);
      expect(lstatSync(directory).mode & 0o777).toBe(0o700);
      expect(lstatSync(nested).mode & 0o777).toBe(0o700);
      expect(lstatSync(artifact).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("erases only the exact apps region", () => {
    expect(eraseAppsCommand("/dev/ttyACM0")).toEqual([
      "esptool.py", "--chip", "esp32p4", "--port", "/dev/ttyACM0", "erase_region", "0x510000", "0x700000",
    ]);
  });

  test("detects tokens and requires the exact image plus a complete erased readback tail", () => {
    expect(() => assertTokenAbsent(Buffer.from("safe"), "secret")).not.toThrow();
    expect(() => assertTokenAbsent(Buffer.from("secret"), "secret")).toThrow("remain");
    const clean = new Uint8Array(0x700000).fill(0xff);
    const expected = Uint8Array.from([0x50, 0x4b, 0x41, 0x50]);
    expect(() => assertInstalledImage(clean, expected)).toThrow("does not match");
    clean.set(expected);
    expect(() => assertInstalledImage(clean, expected)).not.toThrow();
    expect(() => assertTrailingErased(clean, 10)).not.toThrow();
    clean[clean.length - 1] = 0;
    expect(() => assertTrailingErased(clean, 10)).toThrow("not erased");
    expect(() => assertTrailingErased(new Uint8Array(10), 1)).toThrow("length");
  });

  test("requires the matching successful seed readback marker", () => {
    const id = seedIdForConfig("config");
    expect(hasVerificationMarker(`[showroom-ha-panel-provision] verified slot-local readback: 1 bytes id=${id}`, id)).toBe(true);
    expect(hasVerificationMarker(
      `[showroom-ha-panel-provision] verified slot-local readback: 1 bytes id=${id}\nE unrelated component error`, id,
    )).toBe(true);
    expect(hasVerificationMarker(
      `[showroom-ha-panel-provision] verified slot-local readback: 1 bytes id=${id}\n[showroom-ha-panel-provision] readback error`, id,
    )).toBe(false);
    expect(hasVerificationMarker(
      `[showroom-ha-panel-provision] verified slot-local readback: 1 bytes id=wrong\n[showroom-ha-panel-provision] note id=${id}`, id,
    )).toBe(false);
    expect(hasVerificationMarker("missing", id)).toBe(false);
  });
});
