import { NextResponse } from "next/server";

// Server-only — verifies Meta API reachability without exposing AI_PROVIDER_API_KEY to client
export async function GET() {
  const hasKey = !!process.env.AI_PROVIDER_API_KEY;
  const baseUrl = process.env.AI_PROVIDER_BASE_URL || "not-set";
  const wonder = process.env.META_WONDER_MODEL || "muse-wonder";
  const spark = process.env.META_SPARK_MODEL || "muse-spark";
  const voice = process.env.META_VOICE_MODEL || "muse-voice-transcribe";

  // Do not return the key — only presence + safe metadata
  if (!hasKey) {
    return NextResponse.json(
      { ok: false, error: "AI_PROVIDER_API_KEY not set (server-only) — see .env.example", models: { wonder, spark, voice }, baseUrl, verified: false },
      { status: 503 }
    );
  }

  // TODO: live fetch to baseUrl with synthetic prompt to verify model IDs, image/audio support, limits
  return NextResponse.json({ ok: true, baseUrl, models: { wonder, spark, voice }, verified: false, note: "Live verification pending — add synthetic test per AI_AND_VOICE.md D-013" });
}
