import { NextResponse } from "next/server";
import { requireAuth, isAdmin } from "../../../../lib/auth";

// Signed-in owners/admins only. Reports configuration presence — no keys, no provider URL.
export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Forbidden — owners/admins only" }, { status: 403 });
  const hasKey = !!process.env.AI_PROVIDER_API_KEY && !!process.env.AI_PROVIDER_BASE_URL;
  if (!hasKey) return NextResponse.json({ ok: false, configured: false, verified: false, error: "AI provider is not configured on the server" }, { status: 503 });
  return NextResponse.json({
    ok: true,
    configured: true,
    verified: false,
    note: "Live capability verification is pending — run /api/verify/provider and record the results.",
  });
}
