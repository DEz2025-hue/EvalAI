import { NextResponse } from "next/server";
import { voiceTranscribe } from "@eval-ai/ai-adapter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await voiceTranscribe(body);
    // Transcript stays unconfirmed until user edits/confirms — see AI_AND_VOICE.md §3
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, fallback: "Use text input — original audio preserved where supported" }, { status: msg.includes("Missing AI_PROVIDER") ? 503 : 500 });
  }
}
