import { File } from "expo-file-system";

/**
 * Read a file the phone just made (a recording, a photo) into memory.
 *
 * React Native's own fetch(file://…) can hand back an EMPTY body for local files, which showed up as "the recording is
 * empty" even though the phone had recorded fine. expo-file-system reads the file itself, so it is tried first; fetch is
 * only the fallback (for web previews and unusual URIs).
 */
export async function readLocalFile(uri: string): Promise<ArrayBuffer> {
  try {
    const file = new File(uri);
    if (file.exists) {
      const buf = await file.arrayBuffer();
      if (buf.byteLength > 0) return buf;
    }
  } catch {
    /* fall through to fetch */
  }
  const res = await fetch(uri);
  return await res.arrayBuffer();
}

/** Size in bytes of a local file as the phone sees it, or null when it can't be determined. */
export function localFileSize(uri: string): number | null {
  try {
    const file = new File(uri);
    return file.exists ? file.size : null;
  } catch {
    return null;
  }
}

/** Base64 of some bytes, in pieces so a long recording doesn't overflow the call stack. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Below this a recording holds no speech at all (an empty container is a few hundred bytes). */
export const MIN_RECORDING_BYTES = 1500;
