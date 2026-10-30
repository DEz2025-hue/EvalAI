import { createServiceRoleClient } from "./supabase/service";

export type UploadKind = "photo" | "document" | "audio";

export const UPLOAD_RULES: Record<UploadKind, { prefix: string; mimes: string[]; maxBytes: number }> = {
  photo: { prefix: "evidence", mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 20 * 1024 * 1024 },
  document: { prefix: "evidence", mimes: ["application/pdf"], maxBytes: 20 * 1024 * 1024 },
  audio: { prefix: "voice", mimes: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/m4a"], maxBytes: 25 * 1024 * 1024 },
};
export const MIN_BYTES = 100;

const MAGIC: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF (+ WEBP at byte 8, checked below)
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
};

export function kindForMime(mime: string): UploadKind | null {
  for (const kind of Object.keys(UPLOAD_RULES) as UploadKind[]) if (UPLOAD_RULES[kind].mimes.includes(mime)) return kind;
  return null;
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(-80);
  return cleaned || "file";
}

export function hasValidMagic(bytes: Uint8Array, mime: string): boolean {
  const sigs = MAGIC[mime];
  if (!sigs) return true; // audio containers vary — size/type limits still apply
  if (!sigs.some((sig) => sig.every((b, i) => bytes[i] === b))) return false;
  if (mime === "image/webp") return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // "WEBP"
  return true;
}

/** Storage keys are server-generated: <prefix>/<assessmentId>/<uuid>-<safe name>. Anything else is rejected. */
export function isOwnKey(storageKey: string, assessmentId: string): boolean {
  const re = new RegExp("^(evidence|voice)/" + assessmentId.replace(/[^0-9a-fA-F-]/g, "") + "/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}$");
  return re.test(storageKey);
}

export function newStorageKey(kind: UploadKind, assessmentId: string, fileName: string): string {
  return UPLOAD_RULES[kind].prefix + "/" + assessmentId + "/" + crypto.randomUUID() + "-" + safeFileName(fileName);
}

/** Look up an uploaded object's real size/type and its first bytes, using the service role (server only). */
export async function inspectUploadedObject(storageKey: string): Promise<{ size: number; mimetype: string | null; head: Uint8Array } | null> {
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("Evidence storage is not configured on the server");
  const slash = storageKey.lastIndexOf("/");
  const folder = storageKey.slice(0, slash);
  const name = storageKey.slice(slash + 1);
  const { data, error } = await admin.storage.from("evidence").list(folder, { limit: 10, search: name });
  if (error) throw new Error("Could not verify the uploaded file");
  const obj = (data ?? []).find((o) => o.name === name) as { metadata?: { size?: number; mimetype?: string } } | undefined;
  if (!obj) return null;
  const signed = await admin.storage.from("evidence").createSignedUrl(storageKey, 60);
  if (signed.error || !signed.data?.signedUrl) throw new Error("Could not verify the uploaded file");
  const res = await fetch(signed.data.signedUrl, { headers: { Range: "bytes=0-15" } });
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 16);
  return { size: Number(obj.metadata?.size ?? 0), mimetype: obj.metadata?.mimetype ?? null, head };
}

export async function removeObject(storageKey: string): Promise<void> {
  const admin = createServiceRoleClient();
  if (admin) await admin.storage.from("evidence").remove([storageKey]);
}
