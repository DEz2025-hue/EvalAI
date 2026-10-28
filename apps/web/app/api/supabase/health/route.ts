import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY — see .env.example" }, { status: 503 });
  return NextResponse.json({ ok: true, url, hasServiceRole: hasService, note: "RLS deny-by-default, private Storage via signed URLs only after authz" });
}
