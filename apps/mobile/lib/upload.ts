import { apiFetch } from "./api";
import { getSupabase } from "./supabase";

export type UploadResult = { id: string; storageKey: string; itemId: string | null; sizeBytes: number; mimeType: string };

type Opts = { assessmentId: string; itemId?: string; uri: string; fileName: string; mimeType: string };

/** m4a recordings are MP4 containers; Storage and the server accept them as audio/mp4. */
export function normalizeMime(mime: string): string {
  return mime === "audio/m4a" || mime === "audio/x-m4a" ? "audio/mp4" : mime;
}

/**
 * Upload evidence straight to private Storage through a one-time signed URL (no serverless body limit),
 * then ask the server to verify and record it. Falls back to the multipart route where direct upload is unavailable.
 */
export async function uploadEvidence(opts: Opts): Promise<UploadResult> {
  const mimeType = normalizeMime(opts.mimeType);
  const bytes = await (await fetch(opts.uri)).arrayBuffer();

  const prep = await apiFetch("/api/evidence/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId: opts.assessmentId, fileName: opts.fileName, mimeType, sizeBytes: bytes.byteLength }),
  });
  const target = (await prep.json().catch(() => ({}))) as { storageKey?: string; token?: string; path?: string; fallback?: boolean; error?: string };

  if (prep.status === 501 && target.fallback) return legacyUpload(opts, mimeType);
  if (!prep.ok || !target.storageKey || !target.token) throw new Error(target.error ?? "Could not prepare the upload");

  const supabase = getSupabase();
  if (!supabase) throw new Error("App is not connected to Supabase");
  const { error: upErr } = await supabase.storage.from("evidence").uploadToSignedUrl(target.path ?? target.storageKey, target.token, bytes, { contentType: mimeType });
  if (upErr) throw new Error("Upload failed — " + upErr.message);

  const done = await apiFetch("/api/evidence/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId: opts.assessmentId, itemId: opts.itemId ?? null, storageKey: target.storageKey, mimeType }),
  });
  const data = (await done.json().catch(() => ({}))) as UploadResult & { error?: string };
  if (!done.ok) throw new Error(data.error ?? "The upload could not be verified");
  return data;
}

async function legacyUpload(opts: Opts, mimeType: string): Promise<UploadResult> {
  const fd = new FormData();
  // @ts-ignore — React Native FormData accepts a { uri, name, type } descriptor
  fd.append("file", { uri: opts.uri, name: opts.fileName, type: mimeType } as unknown as Blob);
  fd.append("assessmentId", opts.assessmentId);
  if (opts.itemId) fd.append("itemId", opts.itemId);
  const res = await apiFetch(mimeType.startsWith("audio/") ? "/api/voice/upload" : "/api/evidence/upload", { method: "POST", body: fd as never });
  const data = (await res.json().catch(() => ({}))) as UploadResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data;
}
