import { AppState, Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secureStorage } from "./secureStorage";

let cached: SupabaseClient | null = null;

/**
 * React Native has no default network timeout, so an unreachable Supabase would leave screens loading forever.
 * Every request gets a deadline; file uploads (Storage) get a long one.
 */
function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const ms = target.includes("/storage/v1/") ? 180_000 : 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  init?.signal?.addEventListener("abort", () => controller.abort());
  return fetch(input, { ...init, signal: controller.signal })
    .catch((e) => {
      if (controller.signal.aborted && !init?.signal?.aborted) throw new Error("The server took too long to answer. Check your connection and try again.");
      throw e;
    })
    .finally(() => clearTimeout(timer));
}

export function getSupabase(): SupabaseClient | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (cached) return cached;
  const client = createClient(url, anon, {
    auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: fetchWithDeadline },
  });
  // Timers pause while a native app is in the background, so refresh only while it is in the foreground
  // and catch up on resume (Supabase React Native guidance). The web build refreshes on its own.
  if (Platform.OS !== "web") {
    if (AppState.currentState === "active") void client.auth.startAutoRefresh();
    AppState.addEventListener("change", (state) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
  }
  cached = client;
  return cached;
}

export function hasSupabaseEnv(): boolean {
  return !!process.env.EXPO_PUBLIC_SUPABASE_URL && !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
}
