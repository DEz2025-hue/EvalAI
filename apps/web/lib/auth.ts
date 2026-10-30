import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient, type User, type SupabaseClient } from "@supabase/supabase-js";
import { createUserServerClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import type { StoreCtx } from "./store";

export type RequestAuth =
  | { mode: "demo"; ctx: StoreCtx }
  | { mode: "authenticated"; ctx: StoreCtx; user: User; supabase: SupabaseClient }
  | { mode: "unauthenticated" };

export const ACTIVE_WORKSPACE_COOKIE = "eval_ai_workspace";

/** Workspace the caller asked for via cookie (web) or x-workspace-id header (native). Unverified — caller must check membership. */
export function requestedWorkspaceId(cookieHeader: string | null, workspaceHeader: string | null): string | null {
  const direct = workspaceHeader?.trim();
  if (direct) return direct;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === ACTIVE_WORKSPACE_COOKIE) return decodeURIComponent(rest.join("=").trim()) || null;
  }
  return null;
}

export async function ensureWorkspaceId(supabase: SupabaseClient, userId: string, preferredId?: string | null): Promise<string> {
  const { data: memberships, error: memReadErr } = await supabase.from("workspace_memberships").select("workspace_id").eq("user_id", userId);
  if (memReadErr) throw new Error(memReadErr.message);
  const ids = ((memberships ?? []) as Array<{ workspace_id: string }>).map((m) => m.workspace_id);
  if (preferredId && ids.includes(preferredId)) return preferredId;
  if (ids[0]) return ids[0];

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert({ name: "Personal workspace", created_by: userId })
    .select("id")
    .single();
  if (wsErr || !ws) throw new Error(wsErr?.message ?? "Could not create workspace");

  const { error: joinErr } = await supabase.from("workspace_memberships").insert({
    workspace_id: ws.id,
    user_id: userId,
    role: "owner",
  });
  if (joinErr) throw new Error(joinErr.message);
  return ws.id as string;
}

export async function getRequestAuth(): Promise<RequestAuth> {
  if (!isSupabaseConfigured()) {
    return { mode: "demo", ctx: {} };
  }
  // Mobile/native callers have no cookies — they send their Supabase access token.
  const bearer = (await headers()).get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null;
  if (token) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { mode: "unauthenticated" };
    const headerList = (await headers());
    const requested = requestedWorkspaceId(headerList.get("cookie"), headerList.get("x-workspace-id"));
    const workspaceId = await ensureWorkspaceId(supabase, user.id, requested);
    return { mode: "authenticated", user, supabase, ctx: { supabase, userId: user.id, workspaceId } };
  }
  const supabase = await createUserServerClient();
  if (!supabase) return { mode: "demo", ctx: {} };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mode: "unauthenticated" };
  const cookieList = (await headers());
  const requestedWs = requestedWorkspaceId(cookieList.get("cookie"), cookieList.get("x-workspace-id"));
  const workspaceId = await ensureWorkspaceId(supabase, user.id, requestedWs);
  return {
    mode: "authenticated",
    user,
    supabase,
    ctx: { supabase, userId: user.id, workspaceId },
  };
}

export function unauthorized(message = "Sign in required"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden — outside your workspace"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

type Authed = Extract<RequestAuth, { mode: "demo" } | { mode: "authenticated" }>;

/** Server-verified workspace id: auth context wins, client value only in demo mode. */
export function workspaceIdFor(auth: Authed, fallback?: string | null): string | undefined {
  if (auth.mode === "authenticated") return auth.ctx.workspaceId;
  return fallback ?? undefined;
}

/** Map store workspace errors to 403 responses; everything else to 400. */
export function storeError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith("Forbidden")) return forbidden(msg);
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function requireAuth(): Promise<{ auth: Extract<RequestAuth, { mode: "demo" } | { mode: "authenticated" }>; error?: undefined } | { auth?: undefined; error: NextResponse }> {
  const auth = await getRequestAuth();
  if (auth.mode === "unauthenticated") return { error: unauthorized() };
  return { auth };
}
