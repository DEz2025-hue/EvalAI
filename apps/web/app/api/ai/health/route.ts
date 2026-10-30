import { NextResponse } from "next/server";
import { buildAdapterConfig, metaRequest } from "@eval-ai/ai-adapter";
import { requireAuth, isAdmin } from "../../../../lib/auth";

/** Owners/admins only. Which models are configured, and do they exist in the provider's catalog? Free (no inference). */
export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Forbidden — owners/admins only" }, { status: 403 });
  if (!process.env.AI_PROVIDER_API_KEY || !process.env.AI_PROVIDER_BASE_URL) {
    return NextResponse.json({ ok: false, configured: false, error: "The AI provider is not configured on the server" }, { status: 503 });
  }
  try {
    const cfg = buildAdapterConfig(process.env);
    const configured = Object.fromEntries(Object.entries(cfg.ops).map(([op, c]) => [op, { model: c.model, effort: c.reasoningEffort ?? null }]));
    let available: string[] = [];
    let catalogError: string | null = null;
    try {
      const res = await metaRequest(cfg, "/models", { method: "GET" }, { timeoutMs: 15_000, maxRetries: 1 });
      available = ((res.data as { data?: Array<{ id: string }> })?.data ?? []).map((m) => m.id);
    } catch (e) {
      catalogError = e instanceof Error ? e.message : "catalog unavailable";
    }
    const missing = available.length ? [...new Set(Object.values(configured).map((c) => c.model))].filter((m) => !available.includes(m)) : [];
    return NextResponse.json({ ok: !catalogError && missing.length === 0, configured: true, models: configured, catalogReachable: !catalogError, missingModels: missing, note: "Run /api/verify/provider for live capability checks (costs a fraction of a cent)." });
  } catch (e) {
    // e.g. a Contributor-mode model id in the environment
    return NextResponse.json({ ok: false, configured: false, error: e instanceof Error ? e.message : "Invalid AI configuration" }, { status: 500 });
  }
}
