import { getSupabase } from "./supabase";
import { getActiveWorkspace } from "./workspace";

const OFFLINE = "Can't reach the server right now. Check your connection and try again.";
const SLOW = "The server took too long to answer. Check your connection and try again.";

/**
 * Web-API base URL (EXPO_PUBLIC_APP_URL). Throws with a human message when unset.
 * Expo reads .env files only when the dev server starts, so in development the message says how to fix it.
 */
export function apiBase(): string {
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) {
    if (__DEV__) {
      const msg = "EXPO_PUBLIC_APP_URL is not set in this bundle. Add it to apps/mobile/.env.local, then restart Expo with: npx expo start --clear";
      console.warn("[api] " + msg);
      throw new Error(msg);
    }
    throw new Error(OFFLINE);
  }
  return base;
}

/**
 * React Native's networking has NO default timeout (Android's connect/read timeouts are 0), so a server that is
 * down or unreachable leaves a request pending for minutes — screens just spin. Every request gets a deadline.
 * Slow operations (AI, PDFs, uploads) get a longer one.
 */
function timeoutFor(path: string): number {
  if (path.startsWith("/api/ai/")) return 120_000;
  if (path.startsWith("/api/reports/pdf")) return 90_000;
  if (path.startsWith("/api/evidence/upload") || path.startsWith("/api/voice/upload")) return 180_000;
  return 20_000;
}

/**
 * Authenticated fetch against the web API.
 * Sends the Supabase access token and the chosen workspace so server routes enforce workspace + role.
 * A 401 means the session is no longer valid: sign out so the auth gate returns the person to sign-in.
 */
export async function apiFetch(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
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

  const { timeoutMs, signal: callerSignal, ...rest } = init ?? {};
  const controller = new AbortController();
  const deadline = timeoutMs ?? timeoutFor(path);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadline);
  callerSignal?.addEventListener("abort", () => controller.abort());
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(base + path, { ...rest, headers, signal: controller.signal });
  } catch (e) {
    // fetch only rejects when no response arrived at all (server down, wrong address, no network, or our deadline).
    if (__DEV__) {
      const msg = timedOut
        ? `No answer from ${base}${path} after ${Math.round(deadline / 1000)}s. Is the web app running (pnpm dev:web) and reachable from this phone?`
        : `No response from ${base}${path}. Is the web app running (pnpm dev:web) and reachable from this phone?`;
      console.warn("[api] " + msg, e);
      throw new Error(msg);
    }
    throw new Error(timedOut ? SLOW : OFFLINE);
  } finally {
    clearTimeout(timer);
  }
  if (__DEV__) {
    const ms = Date.now() - started;
    if (res.status >= 400) console.warn(`[api] ${init?.method ?? "GET"} ${path} → ${res.status} (${ms}ms)`);
    else if (ms > 3000) console.log(`[api] ${init?.method ?? "GET"} ${path} took ${ms}ms`);
  }
  if (res.status === 401 && token) void supabase?.auth.signOut().catch(() => undefined);
  return res;
}

/** Quick reachability probe (GET /api/health, no auth). Resolves to null when reachable, else a human message. */
export async function checkServer(): Promise<string | null> {
  try {
    const res = await apiFetch("/api/health", { timeoutMs: 6000 });
    return res.ok ? null : `The server answered with an error (${res.status}).`;
  } catch (e) {
    return e instanceof Error ? e.message : OFFLINE;
  }
}
