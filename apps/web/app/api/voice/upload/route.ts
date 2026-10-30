import { NextResponse } from "next/server";
import { storeError, requireWriter } from "../../../../lib/auth";
import { saveEvidenceLocal } from "../../../../lib/store";

const ALLOWED_AUDIO = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const assessmentId = String(form.get("assessmentId") ?? "");
  const itemId = form.get("itemId") as string | null;

  if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 });
  // Accept webm default, but validate
  if (!ALLOWED_AUDIO.has(file.type) && !file.type.startsWith("audio/")) return NextResponse.json({ error: `Audio type ${file.type} not allowed` }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio too large (>25MB)" }, { status: 400 });
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required for private linkage" }, { status: 400 });

  try {
    const storageKey = `voice/${assessmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
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
      note: persisted ? "Audio stored privately + evidence row linked" : "Audio validated — metadata staged to file fallback, private storage pending Supabase env",
    });
  } catch (e) {
    return storeError(e);
  }
}
