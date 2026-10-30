import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, storeError, ACTIVE_WORKSPACE_COOKIE } from "../../../../lib/auth";

const Body = z.object({ workspaceId: z.string().uuid() });

/** Set the active workspace. Verifies the caller is a member before setting the cookie. */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = Body.parse(await req.json());
    const { data: membership, error } = await auth.supabase
      .from("workspace_memberships")
      .select("workspace_id")
      .eq("user_id", auth.user.id)
      .eq("workspace_id", body.workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) return NextResponse.json({ error: "Forbidden — you are not a member of this workspace" }, { status: 403 });
    const res = NextResponse.json({ ok: true, activeWorkspaceId: body.workspaceId });
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, body.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (e) {
    return storeError(e);
  }
}
