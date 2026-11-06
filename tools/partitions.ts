import { readFileSync } from "node:fs";

export interface PartitionEntry {
  name: string;
  type: string;
  subtype: string;
  offset: number;
  size: number;
}

function parseSize(path: string, field: string, value: string): number {
  const match = /^(?:0x([0-9a-f]+)|(\d+)([km])?)$/i.exec(value);
  if (!match) throw new Error(`invalid ${field} in ${path}: ${value}`);
  const bytes = match[1]
    ? Number.parseInt(match[1], 16)
    : Number(match[2]) * (match[3]?.toLowerCase() === "k" ? 1024 : match[3]?.toLowerCase() === "m" ? 1024 * 1024 : 1);
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new Error(`invalid ${field} in ${path}: ${value}`);
  return bytes;
}

export function readPartition(path: string, name: string): PartitionEntry {
  const entries = readFileSync(path, "utf8").split(/\r?\n/)
    .map(line => line.replace(/#.*$/, ""))
    .map(line => line.split(",").map(field => field.trim()))
    .filter(fields => fields.some(Boolean));
  const matches = entries.filter(fields => fields[0] === name);
  if (matches.length !== 1) throw new Error(`expected one ${name} partition in ${path}`);
  const entry = matches[0]!;
  if (entry.length < 5 || !entry[0] || !entry[1] || !entry[2] || !entry[3] || !entry[4])
    throw new Error(`incomplete ${name} partition in ${path}`);
  return {
    name: entry[0],
    type: entry[1],
    subtype: entry[2],
    offset: parseSize(path, `${name} offset`, entry[3]),
    size: parseSize(path, `${name} size`, entry[4]),
  };
}

export function readAppsPartition(path: string): PartitionEntry {
  const partition = readPartition(path, "apps");
  if (partition.type !== "data" || partition.subtype.toLowerCase() !== "0x40")
    throw new Error(`expected apps to use data subtype 0x40 in ${path}`);
  return partition;
}
