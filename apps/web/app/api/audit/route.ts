import { NextResponse } from "next/server";
import { listAuditLocal } from "../../../lib/store";
import { requireAuth, storeError } from "../../../lib/auth";

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ events: [], count: 0, note: "Sign in to view the audit trail" });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 200);
  try {
    const events = await listAuditLocal(auth.ctx.workspaceId, { limit }, auth.ctx);
    return NextResponse.json({ workspaceId: auth.ctx.workspaceId, events, count: events.length });
  } catch (e) {
    return storeError(e);
  }
}
