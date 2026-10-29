import { NextResponse } from "next/server";
import { z } from "zod";
import { listSitesLocal, renameSiteLocal } from "../../../lib/store";
import { requireAuth, workspaceIdFor, storeError } from "../../../lib/auth";

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const workspaceId = workspaceIdFor(auth, url.searchParams.get("workspaceId"));
  try {
    const sites = await listSitesLocal(workspaceId, auth.ctx);
    return NextResponse.json({ sites, count: sites.length });
  } catch (e) {
    return storeError(e);
  }
}

export async function PATCH(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const body = z.object({ id: z.string(), name: z.string().min(2).max(100) }).parse(await req.json());
    const result = await renameSiteLocal(body.id, body.name, auth.ctx);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return storeError(e);
  }
}
