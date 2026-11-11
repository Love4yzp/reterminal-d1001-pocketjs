import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import {
  parseLocalHaConfig,
  serializeLocalHaConfig,
  validateHaConfigMessages,
} from "../apps/showroom-ha-panel/ha-local";
import { readAppsPartition } from "./partitions";

const root = resolve(import.meta.dir, "..");
const appDirectory = resolve(root, "apps/showroom-ha-panel");
const hostConfig = resolve(root, "programs/reterminal-d1001/pocket.host.config.ts");
const partitionsPath = resolve(root, "programs/reterminal-d1001/partitions.csv");
const APP_ID = "dev.pocket-nexus.d1001.showroom-ha-panel";
const PUBLIC_SEED = resolve(appDirectory, "seed.example.json");
const APPS_OFFSET = 0x510000;
const APPS_SIZE = 0x700000;
const OWNER_MARKER = ".showroom-provision-owner";

interface Options {
  seed: string;
  out: string;
  pushSeed: boolean;
  finish: boolean;
  verifyLog?: string;
  rejectTokenFiles: string[];
}

export function parseOptions(args: string[]): Options {
  let seed = "";
  let out = "";
  let verifyLog: string | undefined;
  const rejectTokenFiles: string[] = [];
  let pushSeed = false;
  let finish = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--push-seed") pushSeed = true;
    else if (argument === "--finish") finish = true;
    else if (["--seed", "--out", "--verify-log", "--reject-token-file"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--seed") {
        if (seed) throw new Error("--seed was provided more than once");
        seed = value;
      } else if (argument === "--out") {
        if (out) throw new Error("--out was provided more than once");
        out = value;
      } else if (argument === "--verify-log") {
        if (verifyLog) throw new Error("--verify-log was provided more than once");
        verifyLog = value;
      } else rejectTokenFiles.push(value);
    } else throw new Error(`unknown option ${argument}`);
  }
  if (!seed || !out) throw new Error("--seed and --out are required");
  if (pushSeed === finish) throw new Error("choose exactly one of --push-seed or --finish");
  if (finish && !verifyLog) throw new Error("--finish requires --verify-log");
  if (pushSeed && (verifyLog || rejectTokenFiles.length))
    throw new Error("verification options are valid only with --finish");
  if (finish && rejectTokenFiles.length === 0)
    throw new Error("--finish requires at least one --reject-token-file");
  return {
    seed: resolve(seed),
    out: resolve(out),
    pushSeed,
    finish,
    verifyLog: verifyLog ? resolve(verifyLog) : undefined,
    rejectTokenFiles: rejectTokenFiles.map(value => resolve(value)),
  };
}

export function packageExtent(packageBytes: number): number {
  return Math.ceil((64 + packageBytes) / 65_536) * 65_536;
}

export function assertTmpfsPath(path: string): void {
  const requested = resolve(path);
  if (requested === "/dev/shm" || (existsSync(requested) && realpathSync(requested) === "/dev/shm"))
    throw new Error("secret staging must be a child of /dev/shm, not its root");
  let ancestor = requested;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = realpathSync(ancestor);
  const repository = realpathSync(root);
  if (actual === repository || actual.startsWith(`${repository}${sep}`))
    throw new Error("secret staging must not resolve inside the repository");
  if ((actual !== "/dev/shm" && !actual.startsWith("/dev/shm/")) ||
      Number(statfsSync(actual).type) !== 0x01021994)
    throw new Error(`secret staging must resolve to tmpfs under /dev/shm: ${actual}`);
}

export function assertSecretFile(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`${path} must be a regular file`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${path} must not be readable or writable by group/other`);
}

export function assertPrivateFile(path: string): void {
  assertTmpfsPath(path);
  assertSecretFile(path);
}

export function privatizeTree(path: string): void {
  assertTmpfsPath(path);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`refusing to privatize symlink ${path}`);
  if (stat.isFile()) {
    chmodSync(path, 0o600);
    return;
  }
  if (!stat.isDirectory()) throw new Error(`unsupported staging entry ${path}`);
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) privatizeTree(resolve(path, entry));
}

export function prepareOutput(path: string): void {
  assertTmpfsPath(path);
  const marker = resolve(path, OWNER_MARKER);
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("provisioning output must be a real directory");
    if (!existsSync(marker)) throw new Error("refusing to claim an unowned output directory");
    assertPrivateFile(marker);
    if (readFileSync(marker, "utf8") !== "showroom-ha-panel\n")
      throw new Error("refusing to use an unowned output directory");
    privatizeTree(path);
    return;
  }
  const parent = dirname(path);
  if (parent !== "/dev/shm") assertTmpfsPath(parent);
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory())
    throw new Error("provisioning output parent must be a real directory");
  mkdirSync(path, { mode: 0o700 });
  writeFileSync(marker, "showroom-ha-panel\n", { mode: 0o600, flag: "wx" });
}

function removeOwnedOutput(path: string): void {
  assertTmpfsPath(path);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error("refusing to remove a non-directory provisioning output");
  const marker = resolve(path, OWNER_MARKER);
  assertPrivateFile(marker);
  if (readFileSync(marker, "utf8") !== "showroom-ha-panel\n")
    throw new Error("refusing to remove an unowned output directory");
  rmSync(path, { recursive: true, force: true });
}

export function seedIdForConfig(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 16);
}

export function hasVerificationMarker(log: string, seedId: string): boolean {
  const prefix = "[showroom-ha-panel-provision]";
  const marker = `${prefix} verified slot-local readback`;
  const lines = log.split(/\r?\n/).filter(line => line.includes(prefix));
  const index = lines.findLastIndex(line => line.includes(marker));
  if (index < 0) return false;
  const success = lines[index]!;
  const tail = lines.slice(index).join("\n");
  return success.endsWith(` id=${seedId}`) && !/failed|error|mismatch/i.test(tail);
}

export function assertTokenAbsent(image: Uint8Array, token: string): void {
  if (!token) throw new Error("refusing to check an empty token");
  const bytes = Buffer.from(image);
  if (bytes.includes(Buffer.from(token, "utf8")) || bytes.includes(Buffer.from(token, "utf16le")))
    throw new Error("token bytes remain in the apps partition");
}

export function assertInstalledImage(readback: Uint8Array, expected: Uint8Array): void {
  if (readback.length !== APPS_SIZE) throw new Error(`apps readback length ${readback.length} != ${APPS_SIZE}`);
  if (expected.length > readback.length ||
      !Buffer.from(readback.subarray(0, expected.length)).equals(Buffer.from(expected)))
    throw new Error("apps readback does not match the installed showroom image");
}

export function assertTrailingErased(image: Uint8Array, packageBytes: number): void {
  const start = 64 + packageBytes;
  if (image.length !== APPS_SIZE) throw new Error(`apps readback length ${image.length} != ${APPS_SIZE}`);
  if (start > image.length) throw new Error("apps readback is shorter than the installed package");
  for (let index = start; index < image.length; index += 1)
    if (image[index] !== 0xff) throw new Error(`apps trailing byte is not erased at 0x${index.toString(16)}`);
}

function partition() {
  const value = readAppsPartition(partitionsPath);
  if (value.offset !== APPS_OFFSET || value.size !== APPS_SIZE)
    throw new Error("partition table does not match the expected apps region");
  return value;
}

export function eraseAppsCommand(port: string): string[] {
  partition();
  return ["esptool.py", "--chip", "esp32p4", "--port", port, "erase_region", "0x510000", "0x700000"];
}

function readAppsCommand(port: string, output: string): string[] {
  partition();
  return ["esptool.py", "--chip", "esp32p4", "--port", port, "read_flash", "0x510000", "0x700000", output];
}

function run(command: string[]): void {
  const result = Bun.spawnSync(command, { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (!result.success) throw new Error(`${basename(command[0]!)} failed with exit code ${result.exitCode}`);
}

function compile(project: string, manifest: string, outdir: string, output: string): number {
  run([
    resolve(root, "tools/pocket"), "compile",
    "--manifest", manifest,
    "--host-config", hostConfig,
    "--project-root", project,
    "--outdir", outdir,
    "--output", output,
  ]);
  const bytes = Bun.file(output).size;
  const extent = packageExtent(bytes);
  if (extent > partition().size) throw new Error(`PKAP extent ${extent} exceeds apps partition ${partition().size}`);
  return bytes;
}

function assertWriterCompatible(): void {
  run([
    process.env.D1001_PYTHON || "python",
    "-c",
    "from esptool.cmds import _diff_flash_regions, connect_esp, write_flash",
  ]);
}

function pushPackage(packagePath: string, imageDirectory: string): void {
  run([
    process.execPath, "run", "app:push",
    "--package", packagePath,
    "--slot", APP_ID,
    "--image-dir", imageDirectory,
  ]);
}

function buildSeed(seedPath: string, out: string, normalized: string, seedId: string): string {
  const project = resolve(out, "seed-project");
  mkdirSync(project, { recursive: true, mode: 0o700 });
  cpSync(appDirectory, project, { recursive: true });
  const manifestPath = resolve(project, "pocket.app.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    id: string;
    app: Record<string, unknown>;
    engine: unknown;
    domains?: unknown;
  };
  if (manifest.id !== APP_ID) throw new Error("showroom manifest id changed unexpectedly");
  manifest.app.entry = "provision.tsx";
  manifest.app.output = "showroom-ha-panel-provision";
  manifest.app.viewport = { fixed: { logical: [[400, 640]], presentation: "native" } };
  delete manifest.domains;
  manifest.engine = { capabilities: { requires: ["data.fs", "text.glyphs.baked"] } };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const generatedSeed = resolve(project, "seed.ts");
  writeFileSync(generatedSeed,
    `export const SEED_CONFIG_JSON = ${JSON.stringify(normalized)};\n` +
    `export const SEED_ID = ${JSON.stringify(seedId)};\n`, { mode: 0o600 });
  chmodSync(generatedSeed, 0o600);
  const packagePath = resolve(out, "showroom-ha-panel-provision.pocket");
  const bytes = compile(project, manifestPath, resolve(out, "seed-build"), packagePath);
  privatizeTree(out);
  console.log(`provision package bytes: ${bytes}; extent: ${packageExtent(bytes)}/${APPS_SIZE}`);
  return packagePath;
}

function buildNormal(out: string): { packagePath: string; bytes: number } {
  const manifestPath = resolve(appDirectory, "pocket.app.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    id?: unknown;
    app?: { entry?: unknown; output?: unknown };
    engine?: { capabilities?: { requires?: unknown } };
  };
  const capabilities = manifest.engine?.capabilities?.requires;
  if (manifest.id !== APP_ID || manifest.app?.entry !== "main.tsx" ||
      manifest.app.output !== "showroom-ha-panel" || !Array.isArray(capabilities) ||
      !capabilities.includes("data.fs"))
    throw new Error("normal showroom manifest identity or data.fs capability is invalid");
  const packagePath = resolve(out, "showroom-ha-panel.pocket");
  const bytes = compile(
    appDirectory,
    manifestPath,
    resolve(out, "normal-build"),
    packagePath,
  );
  return { packagePath, bytes };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.seed !== PUBLIC_SEED) assertPrivateFile(options.seed);
  prepareOutput(options.out);
  const source = readFileSync(options.seed, "utf8");
  const parsed = parseLocalHaConfig(source);
  validateHaConfigMessages(parsed);
  const normalized = serializeLocalHaConfig(JSON.parse(source));
  const seedId = seedIdForConfig(normalized);
  const port = process.env.D1001_PORT || "/dev/ttyACM0";

  if (options.pushSeed) {
    const packagePath = buildSeed(options.seed, options.out, normalized, seedId);
    assertWriterCompatible();
    run(eraseAppsCommand(port));
    try {
      pushPackage(packagePath, resolve(options.out, "images"));
    } finally {
      privatizeTree(options.out);
    }
    console.log(`seed pushed after complete apps erase; seed id=${seedId}`);
    return;
  }

  const log = readFileSync(options.verifyLog!, "utf8");
  if (!hasVerificationMarker(log, seedId))
    throw new Error("slot-local seed readback is not verified; refusing to erase apps");
  const normal = buildNormal(options.out);
  const normalBytes = new Uint8Array(await Bun.file(normal.packagePath).arrayBuffer());
  for (const tokenPath of options.rejectTokenFiles) {
    assertSecretFile(tokenPath);
    assertTokenAbsent(normalBytes, readFileSync(tokenPath, "utf8").trim());
  }

  assertWriterCompatible();
  run(eraseAppsCommand(port));
  pushPackage(normal.packagePath, resolve(options.out, "images"));
  const readback = resolve(options.out, "apps-after.bin");
  run(readAppsCommand(port, readback));
  const image = new Uint8Array(await Bun.file(readback).arrayBuffer());
  const shortImagePath = resolve(options.out, "images/showroom-ha-panel.short.bin");
  const expectedImage = new Uint8Array(await Bun.file(shortImagePath).arrayBuffer());
  if (expectedImage.length !== 64 + normal.bytes)
    throw new Error("generated showroom short image has an unexpected length");
  assertInstalledImage(image, expectedImage);
  for (const tokenPath of options.rejectTokenFiles)
    assertTokenAbsent(image, readFileSync(tokenPath, "utf8").trim());
  assertTrailingErased(image, normal.bytes);
  console.log("provisioning verified: full apps readback contains no rejected token and trailing bytes are erased");
  removeOwnedOutput(options.out);
}

if (import.meta.main) {
  try { await main(); }
  catch (error) {
    console.error(`showroom-ha-panel-provision: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
