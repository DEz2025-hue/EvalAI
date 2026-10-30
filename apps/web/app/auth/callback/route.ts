import { NextResponse } from "next/server";
import { createUserServerClient } from "../../../lib/supabase/server";

// Exchanges the one-time code from Supabase auth emails (password recovery, confirmation) for a session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  if (code) {
    const supabase = await createUserServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/auth/sign-in?error=link_invalid", url.origin));
}
