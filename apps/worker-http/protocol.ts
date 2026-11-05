// Change this constant to fetch another URL. The response body is capped at
// 256 KiB by the worker's io.http descriptor.
export const TARGET_URL = "http://192.168.77.126:8123/";
export const PHASES = ["Ready", "Request accepted", "Headers received", "Receiving body", "Complete", "Failed"] as const;
export const Phase = { ready: 0, accepted: 1, headers: 2, body: 3, complete: 4, failed: 5 } as const;

export const PROGRESS_BYTES = 256;
const ERROR_LENGTH_OFFSET = 14;
const ERROR_OFFSET = 16;
const ERROR_BYTES = PROGRESS_BYTES - ERROR_OFFSET;

// progress (worker -> UI, 256 bytes): phase u32, body bytes u32, resource
// status i32, HTTP status u16, error length u8, reserved u8, printable ASCII
// error bytes. All integer fields are little endian.
export interface Progress {
  phase: number;
  bytes: number;
  status: number;
  code: number;
  error: string;
}

export function encodeProgress(progress: Progress, into = new Uint8Array(PROGRESS_BYTES)): Uint8Array {
  into.fill(0);
  const view = new DataView(into.buffer, into.byteOffset, into.byteLength);
  view.setUint32(0, progress.phase, true);
  view.setUint32(4, progress.bytes, true);
  view.setInt32(8, progress.status, true);
  view.setUint16(12, progress.code, true);
  const length = Math.min(progress.error.length, ERROR_BYTES);
  view.setUint8(ERROR_LENGTH_OFFSET, length);
  for (let index = 0; index < length; index++) {
    const code = progress.error.charCodeAt(index);
    into[ERROR_OFFSET + index] = code >= 0x20 && code < 0x7f ? code : 0x3f;
  }
  return into;
}

export function decodeProgress(bytes: Uint8Array): Progress {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = Math.min(view.getUint8(ERROR_LENGTH_OFFSET), ERROR_BYTES);
  let error = "";
  for (let index = 0; index < length; index++) error += String.fromCharCode(bytes[ERROR_OFFSET + index]!);
  return {
    phase: view.getUint32(0, true),
    bytes: view.getUint32(4, true),
    status: view.getInt32(8, true),
    code: view.getUint16(12, true),
    error,
  };
}
