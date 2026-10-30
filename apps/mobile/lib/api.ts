import { getSupabase } from "./supabase";
import { getActiveWorkspace } from "./workspace";

/** Web-API base URL (EXPO_PUBLIC_APP_URL). Throws with a human message when unset. */
export function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("API not configured — set EXPO_PUBLIC_APP_URL to your web app URL.");
  return base;
}

/**
 * Authenticated fetch against the web API.
 * Sends the Supabase access token and the chosen workspace so server routes enforce workspace + role.
 * A 401 means the session is no longer valid: sign out so the auth gate returns the person to sign-in.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = apiBase();
  const supabase = getSupabase();
  let token: string | null = null;
  try {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    token = data.session?.access_token ?? null;
  } catch {
    token = null;
  }
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = "Bearer " + token;
  const workspace = await getActiveWorkspace().catch(() => null);
  if (workspace) headers["x-workspace-id"] = workspace;
  const res = await fetch(base + path, { ...init, headers });
  if (res.status === 401 && token) void supabase?.auth.signOut().catch(() => undefined);
  return res;
}
