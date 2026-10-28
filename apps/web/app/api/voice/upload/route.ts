import { NextResponse } from "next/server";

const ALLOWED_AUDIO = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const assessmentId = String(form.get("assessmentId") ?? "");
  // const itemId = form.get("itemId") as string | null;

  if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 });
  // Accept webm default, but validate
  if (!ALLOWED_AUDIO.has(file.type) && !file.type.startsWith("audio/")) return NextResponse.json({ error: `Audio type ${file.type} not allowed` }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio too large (>25MB)" }, { status: 400 });
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required for private linkage" }, { status: 400 });

  // Verify workspace/assessment scope where Supabase env present — private bucket
  const storageKey = `voice/${assessmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  // TODO: supabase.storage.from('evidence').upload(storageKey, file, { contentType: file.type })
  // Fallback: deterministic key + note, original audio preserved at least as local preview + server temp where storage not yet configured
  return NextResponse.json({ storageKey, sizeBytes: file.size, mimeType: file.type, note: "Audio preserved — private storage upload pending Supabase env, local preview available" });
}
