import { NextResponse } from "next/server";
import { voiceTranscribe } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiRateLimited } from "../../../../lib/aiRoute";

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = aiRateLimited(auth, "transcribe");
  if (limited) return limited;
  try {
    const body = await req.json();
    const result = await voiceTranscribe(body);
    // Voice transcripts are untrusted — never auto-convert to precise values, always isUnconfirmed:true until human edits/confirms
    // Spoken responses: text only until TTS verified (Phase 4), audioUrl preserved separately via /api/voice/upload
    return NextResponse.json({ ...result, spokenAvailable: false, note: "Transcript unconfirmed — edit and confirm before saving; numbers/units require human verification" });
  } catch (e) {
    const res = aiError(e);
    // Keep the manual-entry hint so the recorder can fall back to typing.
    const body = (await res.json()) as { error: string };
    return NextResponse.json({ ...body, fallback: "Use text input — original audio preserved where supported", isUnconfirmed: true }, { status: res.status });
  }
}
