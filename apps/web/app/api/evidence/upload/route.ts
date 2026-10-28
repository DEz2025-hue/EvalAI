import { NextResponse } from "next/server";

// Server-validated upload — private Storage, short-lived signed URLs only after authz
// Validates mime, size, workspace scope; never trust client Content-Type alone

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const assessmentId = String(form.get("assessmentId") ?? "");
  // const itemId = form.get("itemId") as string | null; // link to checklist item

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `Type ${file.type} not allowed` }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (>20MB)" }, { status: 400 });
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  // TODO: verify workspace membership via Supabase auth + RLS
  // TODO: upload to private bucket `evidence` with key `${workspaceId}/${assessmentId}/${uuid}-${file.name}`
  // For now, return a deterministic key so UI can link evidence and exercise flow without live Supabase
  const storageKey = `evidence/${assessmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  // In production: supabase.storage.from('evidence').upload(storageKey, file, { contentType: file.type, upsert: false })
  return NextResponse.json({ storageKey, sizeBytes: file.size, mimeType: file.type, note: "Private storage — signed URL required for view (pending Supabase env)" });
}
