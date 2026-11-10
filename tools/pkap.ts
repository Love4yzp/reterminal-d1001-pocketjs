// PKAP v1 layout: pocket_system/src/flash_store.c in the M5Stack Tab5 reference.
// The apps partition stores a 64-byte header followed by the whole `.pocket`
// bundle (pak plus JS), rounded up to 64 KiB pages. Size limits apply to that
// extent, not to the `.pak` alone.
export const PKAP_HEADER_BYTES = 64;
export const PKAP_PAGE_BYTES = 65_536;

export function pkapPages(packageBytes: number): number {
  return Math.ceil((PKAP_HEADER_BYTES + packageBytes) / PKAP_PAGE_BYTES);
}

export function pkapExtentBytes(packageBytes: number): number {
  return pkapPages(packageBytes) * PKAP_PAGE_BYTES;
}

/** Throws when the `.pocket` bundle's PKAP extent exceeds the apps partition. */
export function assertFitsApps(packageBytes: number, partitionSize: number): number {
  const extent = pkapExtentBytes(packageBytes);
  if (extent > partitionSize)
    throw new Error(`.pocket is ${packageBytes} bytes; its PKAP extent needs ${extent} bytes but the apps partition has ${partitionSize}`);
  return partitionSize - extent;
}
