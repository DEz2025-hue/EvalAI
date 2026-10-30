import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secureStorage } from "./secureStorage";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (cached) return cached;
  cached = createClient(url, anon, {
    auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return cached;
}

export function hasSupabaseEnv(): boolean {
  return !!process.env.EXPO_PUBLIC_SUPABASE_URL && !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
}
