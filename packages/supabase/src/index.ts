import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** @deprecated Prefer the cookie user client in apps/web. Service role bypasses RLS — storage/admin only after authz. */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env — see .env.example");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** @deprecated Use createSupabaseServiceRoleClient. Kept so existing imports fail loudly if used for CRUD. */
export function createSupabaseServerClient(): SupabaseClient {
  return createSupabaseServiceRoleClient();
}

/** Mobile / non-cookie browser client (anon + RLS). Web auth should use @supabase/ssr in apps/web. */
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY — see .env.example");
  return createClient(url, anon);
}
