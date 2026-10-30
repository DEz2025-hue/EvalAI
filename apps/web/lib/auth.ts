import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient, type User, type SupabaseClient } from "@supabase/supabase-js";
import { createUserServerClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import type { StoreCtx } from "./store";

export type RequestAuth =
  | { mode: "demo"; ctx: StoreCtx }
  | { mode: "authenticated"; ctx: StoreCtx; user: User; supabase: SupabaseClient }
  | { mode: "unauthenticated" }
  | { mode: "unconfigured" };

/** Demo mode (open, file-backed, no auth) is for local development only. */
export function demoModeAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";
}

/** Roles that may create/modify data. Viewers are read-only. */
export const WRITER_ROLES = ["owner", "admin", "member"] as const;

export const ACTIVE_WORKSPACE_COOKIE = "eval_ai_workspace";

/** Workspace the caller asked for via cookie (web) or x-workspace-id header (native). Unverified — caller must check membership. */
export function requestedWorkspaceId(cookieHeader: string | null, workspaceHeader: string | null): string | null {
  const direct = workspaceHeader?.trim();
  if (direct) return direct;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === ACTIVE_WORKSPACE_COOKIE) {
      try {
        return decodeURIComponent(rest.join("=").trim()) || null;
      } catch {
        return null; // malformed cookie — ignore, fall back to the first membership
      }
    }
  }
  return null;
}

export async function ensureWorkspaceId(supabase: SupabaseClient, userId: string, preferredId?: string | null): Promise<string> {
  const { data: memberships, error: memReadErr } = await supabase.from("workspace_memberships").select("workspace_id").eq("user_id", userId).order("created_at", { ascending: true });
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

/** Caller's role in a workspace (null when not a member). */
export async function membershipRole(supabase: SupabaseClient, userId: string, workspaceId: string): Promise<string | null> {
  const { data, error } = await supabase.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { role: string } | null)?.role ?? null;
}

export async function getRequestAuth(): Promise<RequestAuth> {
  if (!isSupabaseConfigured()) {
    return demoModeAllowed() ? { mode: "demo", ctx: {} } : { mode: "unconfigured" };
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
    const role = await membershipRole(supabase, user.id, workspaceId);
    return { mode: "authenticated", user, supabase, ctx: { supabase, userId: user.id, email: user.email ?? undefined, workspaceId, role: role ?? undefined } };
  }
  const supabase = await createUserServerClient();
  if (!supabase) return demoModeAllowed() ? { mode: "demo", ctx: {} } : { mode: "unconfigured" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mode: "unauthenticated" };
  const cookieList = (await headers());
  const requestedWs = requestedWorkspaceId(cookieList.get("cookie"), cookieList.get("x-workspace-id"));
  const workspaceId = await ensureWorkspaceId(supabase, user.id, requestedWs);
  const role = await membershipRole(supabase, user.id, workspaceId);
  return {
    mode: "authenticated",
    user,
    supabase,
    ctx: { supabase, userId: user.id, email: user.email ?? undefined, workspaceId, role: role ?? undefined },
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

/**
 * Map store errors to safe responses: Forbidden -> 403, not found -> 404, conflicts -> 409,
 * raw database failures -> generic 500 (details are logged server-side, never returned).
 */
export function storeError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && e.name === "DbFailure") {
    return NextResponse.json({ error: "Database operation failed — please retry" }, { status: 500 });
  }
  if (e instanceof Error && e.name === "DbConflict") return NextResponse.json({ error: msg }, { status: 409 });
  if (msg.startsWith("Forbidden")) return forbidden(msg);
  if (e instanceof Error && e.name === "ZodError") return NextResponse.json({ error: "Invalid request", issues: (e as unknown as { issues: unknown }).issues }, { status: 400 });
  if (/not found/i.test(msg)) return NextResponse.json({ error: msg }, { status: 404 });
  return NextResponse.json({ error: msg }, { status: 400 });
}

type AuthOk = { auth: Authed; error?: undefined };
type AuthFail = { auth?: undefined; error: NextResponse };

export async function requireAuth(): Promise<AuthOk | AuthFail> {
  const auth = await getRequestAuth();
  if (auth.mode === "unauthenticated") return { error: unauthorized() };
  if (auth.mode === "unconfigured") return { error: NextResponse.json({ error: "Service is not configured" }, { status: 503 }) };
  return { auth };
}

/** Like requireAuth, but rejects read-only members (viewers). Use on every mutating handler. */
/** True for demo mode and for owner/admin/member; false for viewers and unknown roles. */
export function isWriter(auth: Authed): boolean {
  if (auth.mode !== "authenticated") return true;
  return !!auth.ctx.role && (WRITER_ROLES as readonly string[]).includes(auth.ctx.role);
}

/** True for demo mode and for owner/admin (privileged operations). */
export function isAdmin(auth: Authed): boolean {
  if (auth.mode !== "authenticated") return true;
  return auth.ctx.role === "owner" || auth.ctx.role === "admin";
}

export async function requireWriter(): Promise<AuthOk | AuthFail> {
  const r = await requireAuth();
  if (r.error) return r;
  if (r.auth.mode === "authenticated") {
    const role = r.auth.ctx.role;
    if (!role || !(WRITER_ROLES as readonly string[]).includes(role)) {
      return { error: forbidden("Forbidden — your role is read-only in this workspace") };
    }
  }
  return r;
}
