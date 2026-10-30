import { createSupabaseBrowserClient } from "@eval-ai/supabase";

export type UploadResult = { id: string; storageKey: string; itemId: string | null; sizeBytes: number; mimeType: string };

type Opts = { assessmentId: string; itemId?: string; fileName?: string; mimeType?: string };

/**
 * Upload evidence (photo / PDF / audio). Large files go straight to private Storage through a one-time
 * signed URL, so the serverless request-body limit does not apply; the server then verifies what was stored.
 * Where direct upload is unavailable (demo mode) the small-file multipart route is used instead.
 */
export async function uploadEvidence(file: Blob, opts: Opts): Promise<UploadResult> {
  const mimeType = opts.mimeType ?? file.type;
  const fileName = opts.fileName ?? (file as File).name ?? "file";
  const prep = await fetch("/api/evidence/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId: opts.assessmentId, fileName, mimeType, sizeBytes: file.size }),
  });
  const target = (await prep.json().catch(() => ({}))) as { storageKey?: string; token?: string; path?: string; fallback?: boolean; error?: string };

  if (prep.status === 501 && target.fallback) return legacyUpload(file, { ...opts, fileName, mimeType });
  if (!prep.ok || !target.storageKey || !target.token) throw new Error(target.error ?? "Could not prepare the upload");

  const supabase = createSupabaseBrowserClient();
  const { error: upErr } = await supabase.storage.from("evidence").uploadToSignedUrl(target.path ?? target.storageKey, target.token, file, { contentType: mimeType });
  if (upErr) throw new Error("Upload failed — " + upErr.message);

  const done = await fetch("/api/evidence/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId: opts.assessmentId, itemId: opts.itemId ?? null, storageKey: target.storageKey, mimeType }),
  });
  const data = (await done.json().catch(() => ({}))) as UploadResult & { error?: string };
  if (!done.ok) throw new Error(data.error ?? "The upload could not be verified");
  return data;
}

async function legacyUpload(file: Blob, opts: Required<Pick<Opts, "fileName" | "mimeType">> & Opts): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file, opts.fileName);
  fd.append("assessmentId", opts.assessmentId);
  if (opts.itemId) fd.append("itemId", opts.itemId);
  const res = await fetch(opts.mimeType.startsWith("audio/") ? "/api/voice/upload" : "/api/evidence/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as UploadResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data;
}
