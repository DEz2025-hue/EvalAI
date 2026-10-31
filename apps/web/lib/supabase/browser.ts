"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}

/**
 * Cookie-backed browser client. The session must live in cookies so middleware and server routes see the
 * signed-in user — a plain supabase-js client keeps it in localStorage and every server check fails.
 */
export function browserSupabase(): SupabaseClient {
  const client = createBrowserSupabase();
  if (!client) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY — see .env.example");
  return client;
}
