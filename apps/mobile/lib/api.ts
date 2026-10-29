import { getSupabase } from "./supabase";

/** Web-API base URL (EXPO_PUBLIC_APP_URL). Throws with a human message when unset. */
export function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("API not configured — set EXPO_PUBLIC_APP_URL to your web app URL.");
  return base;
}

/**
 * Authenticated fetch against the web API.
 * Attaches the Supabase access token when signed in so server routes can
 * enforce workspace auth (cookie sessions don't exist on native).
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = apiBase();
  let token: string | null = null;
  try {
    const supabase = getSupabase();
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    token = data.session?.access_token ?? null;
  } catch {
    token = null;
  }
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base}${path}`, { ...init, headers });
}
