import { NextResponse } from "next/server";
import { z } from "zod";
import { listMembersLocal, setMemberRoleLocal, removeMemberLocal, inviteMemberLocal } from "../../../lib/store";
import { requireAuth, storeError } from "../../../lib/auth";

function ws(auth: { mode: string; ctx: { workspaceId?: string } }): string | null {
  return auth.mode === "authenticated" ? (auth.ctx.workspaceId as string) : null;
}

export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const workspaceId = ws(auth);
  if (!workspaceId) return NextResponse.json({ members: [], myRole: null, note: "Sign in to load your team" });
  try {
    const { members, myRole } = await listMembersLocal(workspaceId, auth.ctx);
    return NextResponse.json({ workspaceId, members, myRole, me: auth.ctx.userId ?? null, count: members.length });
  } catch (e) {
    return storeError(e);
  }
}

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const workspaceId = ws(auth);
  if (!workspaceId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = z.object({ email: z.string().email(), role: z.enum(["admin", "member", "viewer"]).default("member") }).parse(await req.json());
    const result = await inviteMemberLocal(workspaceId, body.email, body.role, auth.ctx);
    return NextResponse.json({ ok: true, ...result, note: "Member added — they must already have an account" });
  } catch (e) {
    return storeError(e);
  }
}

export async function PATCH(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const workspaceId = ws(auth);
  if (!workspaceId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = z.object({ userId: z.string().uuid(), role: z.enum(["owner", "admin", "member", "viewer"]) }).parse(await req.json());
    const result = await setMemberRoleLocal(workspaceId, body.userId, body.role, auth.ctx);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return storeError(e);
  }
}

export async function DELETE(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const workspaceId = ws(auth);
  if (!workspaceId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  try {
    const result = await removeMemberLocal(workspaceId, userId, auth.ctx);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return storeError(e);
  }
}
