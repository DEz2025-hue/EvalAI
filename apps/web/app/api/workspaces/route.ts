import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, storeError } from "../../../lib/auth";

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
