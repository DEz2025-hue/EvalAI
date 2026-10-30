import { NextResponse } from "next/server";
import { requireAuth, requireWriter, isWriter, forbidden, storeError } from "../../../../lib/auth";
import { saveEvidenceLocal, listEvidenceLocal, signedEvidenceUrl } from "../../../../lib/store";

// Server-validated upload — private Storage, short-lived signed URLs only after authz
// Validates mime + magic bytes, size, workspace scope; never trust client Content-Type alone

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAGIC: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

async function hasValidMagic(file: File, mime: string): Promise<boolean> {
  const sigs = MAGIC[mime];
  if (!sigs) return true;
  const buf = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return sigs.some((sig) => sig.every((b, i) => buf[i] === b));
}

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const contentType = req.headers.get("content-type") ?? "";

  // JSON action: signed URL for a previously uploaded key
  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as { action?: string; assessmentId?: string; storageKey?: string };
      if (body.action !== "signedUrl" || !body.assessmentId || !body.storageKey) {
        return NextResponse.json({ error: "Expected { action: 'signedUrl', assessmentId, storageKey }" }, { status: 400 });
      }
      const { signedUrl, error } = await signedEvidenceUrl(body.assessmentId, body.storageKey, auth.ctx);
      if (!signedUrl) return NextResponse.json({ error: error ?? "Signed URL unavailable" }, { status: 404 });
      return NextResponse.json({ signedUrl });
    } catch (e) {
      return storeError(e);
    }
  }

  // Multipart upload (writes) — viewers are read-only
  if (!isWriter(auth)) return forbidden("Forbidden — your role is read-only in this workspace");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > 25 * 1024 * 1024) return NextResponse.json({ error: "File too large (>20MB)" }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const assessmentId = String(form.get("assessmentId") ?? "");
  const itemId = form.get("itemId") as string | null;

  if (!file) return NextResponse.json({ error: "No file — select a photo or PDF" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `Type ${file.type} not allowed — allowed: JPEG, PNG, WebP, PDF` }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (>20MB)" }, { status: 400 });
  if (file.size < 100) return NextResponse.json({ error: "File too small or empty" }, { status: 400 });
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required to link evidence privately" }, { status: 400 });

  if (!(await hasValidMagic(file, file.type))) return NextResponse.json({ error: "File content does not match declared type — possible spoofed upload" }, { status: 400 });

  try {
    const storageKey = `evidence/${assessmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { record, persisted } = await saveEvidenceLocal({
      assessmentId,
      itemId,
      storageKey,
      mimeType: file.type,
      sizeBytes: file.size,
      bytes,
      ctx: auth.ctx,
    });
    return NextResponse.json({
      id: record.id,
      storageKey: record.storageKey,
      itemId: record.itemId,
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
      persisted,
      note: persisted
        ? "Uploaded to private storage + evidence row linked"
        : "Validated (mime+magic+size) — stored to deterministic file fallback, private storage pending Supabase env",
    });
  } catch (e) {
    return storeError(e);
  }
}

export async function DELETE(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const assessmentId = url.searchParams.get("assessmentId");
  const evidenceId = url.searchParams.get("evidenceId");
  if (!assessmentId || !evidenceId) return NextResponse.json({ error: "assessmentId and evidenceId required" }, { status: 400 });
  try {
    const { deleteEvidenceLocal } = await import("../../../../lib/store");
    const result = await deleteEvidenceLocal(assessmentId, evidenceId, auth.ctx);
    return NextResponse.json({ ok: true, ...result, note: "Evidence row removed; storage object removed on best effort" });
  } catch (e) {
    return storeError(e);
  }
}

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const assessmentId = url.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  try {
    const { items, persisted } = await listEvidenceLocal(assessmentId, auth.ctx);
    return NextResponse.json({
      assessmentId,
      items: items.map((e) => ({ id: e.id, storage_key: e.storageKey, assessment_id: e.assessmentId, item_id: e.itemId, mime_type: e.mimeType, uploaded_at: e.uploadedAt })),
      count: items.length,
      persisted,
    });
  } catch (e) {
    return storeError(e);
  }
}
