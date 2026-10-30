import { NextResponse } from "next/server";
import { probeProvider } from "@eval-ai/ai-adapter";
import { requireAuth, isAdmin } from "../../../../lib/auth";

export const maxDuration = 60;

/**
 * Owners/admins only. Runs one tiny synthetic probe per capability (structured JSON, image input, voice) and
 * reports pass/fail with the provider's error CODE (e.g. billing_not_configured). Synthetic data only; costs a fraction of a cent.
 */
export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Forbidden — owners/admins only" }, { status: 403 });
  if (!process.env.AI_PROVIDER_API_KEY || !process.env.AI_PROVIDER_BASE_URL) {
    return NextResponse.json({ ok: false, error: "The AI provider is not configured on the server", synthetic: true }, { status: 503 });
  }
  try {
    const includeSam = new URL(req.url).searchParams.get("sam") === "1";
    const result = await probeProvider(undefined, { includeSam });
    return NextResponse.json({ ...result, synthetic: true });
  } catch (e) {
    return NextResponse.json({ ok: false, synthetic: true, error: e instanceof Error ? e.message : "Probe failed" }, { status: 500 });
  }
}
