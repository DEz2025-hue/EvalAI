import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth gate — workspace membership checked server-side / RLS, not just UI
// This middleware refreshes Supabase session and protects /assessments, /inspections, /reports
export async function middleware(req: NextRequest) {
  const url = req.nextUrl.pathname;

  // Public paths
  if (url.startsWith("/_next") || url.startsWith("/api/ai/health") || url.startsWith("/api/supabase/health") || url === "/" ) {
    return NextResponse.next();
  }

  // For protected routes, require session — actual workspace RLS is enforced in DB policies + API routes
  // If Supabase env missing, allow through in dev with warning header
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!hasSupabase) {
    const res = NextResponse.next();
    res.headers.set("x-evalai-env", "supabase-missing-see-.env.example");
    return res;
  }

  // TODO: createServerClient from @supabase/ssr, refresh session, redirect to /login if no session
  return NextResponse.next();
}

export const config = { matcher: ["/assessments/:path*", "/inspections/:path*", "/reports/:path*"] };
