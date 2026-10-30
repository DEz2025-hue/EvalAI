import { NextResponse } from "next/server";
import { requireAuth, isAdmin } from "../../../../lib/auth";

// Signed-in owners/admins only — reports which server features are configured, never values.
export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Forbidden — owners/admins only" }, { status: 403 });
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!configured) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  return NextResponse.json({ ok: true, hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
}
