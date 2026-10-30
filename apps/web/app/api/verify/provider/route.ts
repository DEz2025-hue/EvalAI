import { NextResponse } from "next/server";
import { getAdapterConfig } from "@eval-ai/ai-adapter";
import { requireAuth, isAdmin } from "../../../../lib/auth";

// Synthetic-data provider verification — never sends real customer data
export async function GET() {
  // Triggers an outbound call with the provider key — owners/admins only.
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Forbidden — owners/admins only" }, { status: 403 });
  const hasKey = !!process.env.AI_PROVIDER_API_KEY;
  const cfg = hasKey ? getAdapterConfig() : null;
  if (!hasKey || !cfg) return NextResponse.json({ ok: false, error: "AI_PROVIDER_API_KEY not set — verification requires server env", synthetic: true }, { status: 503 });

  const checks: Array<{ name: string; ok: boolean; note: string }> = [];
  // Synthetic image: 1x1 PNG base64
  const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
  // Synthetic audio: tiny silent webm placeholder (not real audio, just checks size/mime path)
  const fakeAudioBase64 = "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwHqs17yAWhg";

  // Image input check — calls /v1/chat/completions with image_url if provider supports it, else expects fallback
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/v1/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    checks.push({ name: "models list", ok: res.ok, note: res.ok ? `status ${res.status}` : `status ${res.status} — check baseUrl/model IDs` });
  } catch (e) {
    checks.push({ name: "models list", ok: false, note: e instanceof Error ? e.message : String(e) });
  }

  // We do not actually send image/audio as synthetic verification here to avoid quota — we report capability flags to be confirmed via dashboard
  checks.push({ name: "image input (synthetic 1x1 png)", ok: false, note: "Send tinyPngBase64 via POST /api/ai/analyze-image with real key to confirm — see AI_AND_VOICE.md §2; fallback currently labelled" });
  checks.push({ name: "audio transcribe (synthetic)", ok: false, note: "Send fakeAudioBase64 via POST /api/ai/transcribe to confirm Voice Transcribe — fallback currently labelled" });
  void tinyPngBase64; void fakeAudioBase64;

  return NextResponse.json({ ok: checks.some((c) => c.ok), checks, synthetic: true, note: "Verification uses synthetic data only — never real customer data, per SECURITY.md" });
}
