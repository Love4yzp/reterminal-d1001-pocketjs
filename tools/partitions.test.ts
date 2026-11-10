import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { readAppsPartition, readPartition } from "./partitions";

const table = fileURLToPath(new URL("../programs/reterminal-d1001/partitions.csv", import.meta.url));

describe("D1001 flash layout", () => {
  test("allocates a 5 MiB factory and a 7 MiB app package region", () => {
    const factory = readPartition(table, "factory");
    const apps = readAppsPartition(table);
    expect(factory).toMatchObject({ offset: 0x10000, size: 5 * 1024 * 1024 });
    expect(apps).toMatchObject({ offset: 0x510000, size: 7 * 1024 * 1024 });
    expect(factory.offset + factory.size).toBe(apps.offset);
    expect(apps.offset % 65536).toBe(0);
    expect(apps.size % 65536).toBe(0);
  });

  test("preserves storage, NVS and PHY boundaries", () => {
    const apps = readAppsPartition(table);
    const storage = readPartition(table, "storage");
    expect(apps.offset + apps.size).toBe(storage.offset);
    expect(storage).toMatchObject({ offset: 0xc10000, size: 0x3f0000 });
    expect(readPartition(table, "nvs")).toMatchObject({ offset: 0x9000, size: 0x6000 });
    expect(readPartition(table, "phy_init")).toMatchObject({ offset: 0xf000, size: 0x1000 });
  });
});

describe("PKAP extent guard", () => {
  test("rounds header plus .pocket bundle up to 64 KiB pages", async () => {
    const { pkapExtentBytes } = await import("./pkap");
    expect(pkapExtentBytes(65_536 - 64)).toBe(65_536);
    expect(pkapExtentBytes(65_536 - 63)).toBe(131_072);
  });

  test("rejects a bundle whose extent overflows the 7 MiB apps partition", async () => {
    const { assertFitsApps } = await import("./pkap");
    const apps = readAppsPartition(table).size;
    // A 7,387,208-byte .pocket (7,123,072-byte pak) needs 113 pages = 7,405,568 bytes.
    expect(() => assertFitsApps(7_387_208, apps)).toThrow(/7405568/);
    expect(assertFitsApps(apps - 64, apps)).toBe(0);
    expect(() => assertFitsApps(apps - 63, apps)).toThrow();
  });
});
