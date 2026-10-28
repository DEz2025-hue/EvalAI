import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "eval-ai web",
    version: "0.1.0",
    checks: {
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "missing — see .env.example",
      ai: !!process.env.AI_PROVIDER_API_KEY ? "configured (server-only)" : "missing — see .env.example",
    },
    security: {
      secretsInClient: false,
      rls: "deny-by-default + workspace membership",
      storage: "private buckets + signed URLs",
    },
  });
}
