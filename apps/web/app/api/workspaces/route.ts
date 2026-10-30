import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, storeError } from "../../../lib/auth";

/** List the caller's workspaces with their role in each. */
export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ workspaces: [], activeWorkspaceId: null, demo: true });
  try {
    const { data: memberships, error: memErr } = await auth.supabase
      .from("workspace_memberships")
      .select("workspace_id, role")
      .eq("user_id", auth.user.id);
    if (memErr) throw memErr;
    const rows = (memberships ?? []) as Array<{ workspace_id: string; role: string }>;
    const roleById = new Map(rows.map((m) => [m.workspace_id, m.role]));
    let workspaces: Array<{ id: string; name: string; role: string; createdAt: string }> = [];
    if (rows.length > 0) {
      const { data: ws, error: wsErr } = await auth.supabase
        .from("workspaces")
        .select("id, name, created_at")
        .in("id", rows.map((m) => m.workspace_id));
      if (wsErr) throw wsErr;
      workspaces = ((ws ?? []) as Array<{ id: string; name: string; created_at: string }>).map((w) => ({
        id: w.id,
        name: w.name,
        role: roleById.get(w.id) ?? "member",
        createdAt: w.created_at,
      }));
    }
    return NextResponse.json({ workspaces, activeWorkspaceId: auth.ctx.workspaceId, count: workspaces.length });
  } catch (e) {
    return storeError(e);
  }
}

/** Create an additional workspace; caller becomes owner. */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = z.object({ name: z.string().min(2).max(100) }).parse(await req.json());
    const { data: ws, error } = await auth.supabase.from("workspaces").insert({ name: body.name.trim(), created_by: auth.user.id }).select("id, name").single();
    if (error) throw error;
    const wid = (ws as { id: string }).id;
    const { error: mErr } = await auth.supabase.from("workspace_memberships").insert({ workspace_id: wid, user_id: auth.user.id, role: "owner" });
    if (mErr) throw mErr;
    return NextResponse.json({ ok: true, workspace: ws });
  } catch (e) {
    return storeError(e);
  }
}
