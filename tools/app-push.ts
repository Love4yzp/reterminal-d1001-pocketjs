import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const buildDirectory = resolve(root, ".pocket-build/apps");
const hostConfig = resolve(root, "programs/reterminal-d1001/pocket.host.config.ts");
const partitionsPath = resolve(root, "programs/reterminal-d1001/partitions.csv");

// PKAP v1 layout: pocket_system/src/flash_store.c in the M5Stack Tab5 reference.
const HEADER_BYTES = 64;
const PAGE_BYTES = 65_536;
const MIN_PACKAGE_BYTES = 40;

interface Options {
  appDirectory?: string;
  packagePath?: string;
  slotId?: string;
}

function usage() {
  console.log("usage: bun run app:push <app-directory>\n" +
    "       bun run app:push --package <existing.pocket> --slot <manifest-id>\n\n" +
    "Compile an app or reuse a package, then write its PKAP v1 short image.\n" +
    "The port defaults to /dev/ttyACM0; set D1001_PORT to override it.");
}

function parseOptions(args: string[]): Options | undefined {
  if (args.includes("--help")) {
    usage();
    return;
  }
  const options: Options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--package" || argument === "--slot") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      const key = argument === "--package" ? "packagePath" : "slotId";
      if (options[key] !== undefined) throw new Error(`${argument} was provided more than once`);
      options[key] = value;
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`unknown option ${argument}`);
    } else if (options.appDirectory !== undefined) {
      throw new Error(`unexpected argument ${argument}`);
    } else {
      options.appDirectory = argument;
    }
  }
  if (options.appDirectory && (options.packagePath || options.slotId))
    throw new Error("an app directory is mutually exclusive with --package and --slot");
  if (!options.appDirectory && (!options.packagePath || !options.slotId))
    throw new Error("provide an app directory, or --package and --slot together");
  return options;
}

function parseSize(value: string, field: string): number {
  let bytes: number;
  if (/^0x[0-9a-f]+$/i.test(value)) {
    bytes = Number.parseInt(value.slice(2), 16);
  } else {
    const match = /^(\d+)([km])?$/i.exec(value);
    if (!match) throw new Error(`invalid ${field} in ${partitionsPath}: ${value}`);
    bytes = Number(match[1]) * (match[2]?.toLowerCase() === "k" ? 1024 : match[2]?.toLowerCase() === "m" ? 1024 * 1024 : 1);
  }
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`invalid ${field} in ${partitionsPath}: ${value}`);
  return bytes;
}

function appsPartition(): { offset: number; size: number } {
  const entries = readFileSync(partitionsPath, "utf8").split(/\r?\n/)
    .map(line => line.replace(/#.*$/, ""))
    .map(line => line.split(",").map(field => field.trim()))
    .filter(fields => fields.some(Boolean));
  const matches = entries.filter(fields =>
    fields[0] === "apps" && fields[1] === "data" && fields[2]?.toLowerCase() === "0x40");
  if (matches.length !== 1) throw new Error(`expected one apps data 0x40 partition in ${partitionsPath}`);
  const entry = matches[0]!;
  if (entry.length < 5 || !entry[3] || !entry[4]) throw new Error(`incomplete apps partition in ${partitionsPath}`);
  return { offset: parseSize(entry[3], "apps offset"), size: parseSize(entry[4], "apps size") };
}

async function run(command: string[]) {
  const child = Bun.spawn(command, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const status = await child.exited;
  if (status !== 0 || child.signalCode) throw new Error(`${basename(command[0]!)} failed: ${child.signalCode ?? status}`);
}

async function compileApp(directory: string): Promise<{ packagePath: string; id: string }> {
  const appDirectory = resolve(directory);
  const manifestPath = resolve(appDirectory, "pocket.app.json");
  let manifest: unknown;
  try {
    manifest = await Bun.file(manifestPath).json();
  } catch (error) {
    throw new Error(`cannot read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = manifest as { id?: unknown; app?: { output?: unknown } };
  if (typeof value?.id !== "string" || !value.id) throw new Error(`${manifestPath} requires a non-empty id`);
  if (typeof value.app?.output !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value.app.output))
    throw new Error(`${manifestPath} requires an app.output filename without path separators`);
  const output = value.app.output;
  const packagePath = resolve(buildDirectory, `${output}.pocket`);
  await run([
    resolve(root, "tools/pocket"), "compile",
    "--manifest", manifestPath,
    "--host-config", hostConfig,
    "--project-root", appDirectory,
    "--outdir", resolve(buildDirectory, output),
    "--output", packagePath,
  ]);
  return { packagePath, id: value.id };
}

function shortImage(packageBytes: Uint8Array, id: string, partitionSize: number) {
  if (packageBytes.length < MIN_PACKAGE_BYTES)
    throw new Error(`package is ${packageBytes.length} bytes; PKAP v1 requires at least ${MIN_PACKAGE_BYTES}`);
  const pages = Math.ceil((HEADER_BYTES + packageBytes.length) / PAGE_BYTES);
  if (pages * PAGE_BYTES > partitionSize)
    throw new Error(`package extent needs ${pages * PAGE_BYTES} bytes; apps partition has ${partitionSize}`);

  const packageView = new DataView(packageBytes.buffer, packageBytes.byteOffset, packageBytes.byteLength);
  const hash = packageView.getBigUint64(packageBytes.length - 8, true);
  const slot = createHash("sha256").update(id, "utf8").digest("hex").slice(0, 16);
  const header = new Uint8Array(HEADER_BYTES);
  header.fill(0xff);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x50414b50, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, packageBytes.length, true);
  view.setUint32(12, pages, true);
  view.setUint32(16, 1, true);
  view.setUint32(20, 0, true);
  view.setBigUint64(24, hash, true);
  header.set(new TextEncoder().encode(slot), 32);

  const image = new Uint8Array(HEADER_BYTES + packageBytes.length);
  image.set(header);
  image.set(packageBytes, HEADER_BYTES);
  return { image, hash, slot };
}

function startWriter(offset: number) {
  return Bun.spawn([
    "python", resolve(root, "tools/esptool-push.py"),
    "--port", process.env.D1001_PORT || "/dev/ttyACM0",
    "--offset", `0x${offset.toString(16)}`,
  ], { cwd: root, stdin: "pipe", stdout: "inherit", stderr: "inherit" });
}

async function main() {
  const options = parseOptions(Bun.argv.slice(2));
  if (!options) return;
  const partition = appsPartition();
  const writer = startWriter(partition.offset);
  try {
    const compiled = options.appDirectory ? await compileApp(options.appDirectory) : undefined;
    const packagePath = compiled?.packagePath ?? resolve(options.packagePath!);
    const id = compiled?.id ?? options.slotId!;
    const packageBytes = new Uint8Array(await Bun.file(packagePath).arrayBuffer());
    const { image, hash, slot } = shortImage(packageBytes, id, partition.size);
    const name = basename(packagePath, extname(packagePath)) || "app";
    const imagePath = resolve(buildDirectory, `${name}.short.bin`);
    const previousImagePath = resolve(buildDirectory, `${name}.previous.bin`);
    mkdirSync(buildDirectory, { recursive: true });
    await Bun.write(imagePath, image);

    console.log(`package: ${packagePath}`);
    console.log(`package bytes: ${packageBytes.length}`);
    console.log(`hash: 0x${hash.toString(16).padStart(16, "0")}`);
    console.log(`slot: ${slot}`);
    console.log(`flash offset: 0x${partition.offset.toString(16)}`);
    console.log(`short image: ${imagePath}`);
    const previous = existsSync(previousImagePath) ? previousImagePath : undefined;
    if (previous) console.log(`diff against: ${previous}`);

    await writer.stdin.write(`${JSON.stringify({ image: imagePath, previous })}\n`);
    await writer.stdin.end();
    const status = await writer.exited;
    if (status !== 0 || writer.signalCode)
      throw new Error(`esptool failed: ${writer.signalCode ?? status}`);
    await Bun.write(previousImagePath, image);
  } catch (error) {
    await writer.stdin.end().catch(() => undefined);
    await writer.exited;
    throw error;
  }
}

try { await main(); }
catch (error) {
  console.error(`app-push: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
