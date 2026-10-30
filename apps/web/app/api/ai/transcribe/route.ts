import { NextResponse } from "next/server";
import { voiceTranscribe } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const result = await voiceTranscribe(body);
    // Voice transcripts are untrusted — never auto-convert to precise values, always isUnconfirmed:true until human edits/confirms
    // Spoken responses: text only until TTS verified (Phase 4), audioUrl preserved separately via /api/voice/upload
    return NextResponse.json({ ...result, spokenAvailable: false, note: "Transcript unconfirmed — edit and confirm before saving; numbers/units require human verification" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, fallback: "Use text input — original audio preserved where supported", isUnconfirmed: true }, { status: msg.includes("Missing AI_PROVIDER") ? 503 : msg.includes("Rate limited") ? 429 : 500 });
  }
}
