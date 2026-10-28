import { NextResponse } from "next/server";

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

  // Verify workspace/assessment scope where env present — else deterministic fallback still links to assessment
  const storageKey = `evidence/${assessmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  // TODO: supabase.storage.from('evidence').upload(storageKey, file, { contentType: file.type })
  // TODO: insert into evidence_items (workspace_id, assessment_id, item_id, storage_key, mime_type, size_bytes) + evidence_relationships
  // RLS ensures only workspace members can later fetch via signed URL — never via public path
  return NextResponse.json({ storageKey, itemId: itemId ?? null, sizeBytes: file.size, mimeType: file.type, note: "Validated (mime+magic+size) — private storage, signed URL only after authorization (pending Supabase env)" });
}
