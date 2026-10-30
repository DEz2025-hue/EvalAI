import { NextResponse } from "next/server";
import { z } from "zod";
import { listSitesLocal, createSiteLocal, updateSiteLocal, deleteSiteLocal } from "../../../lib/store";
import { requireAuth, workspaceIdFor, storeError, requireWriter, isAdmin, forbidden } from "../../../lib/auth";

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

const CreateBody = z.object({ name: z.string().trim().min(2).max(100), address: z.string().trim().max(200).optional() });

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = CreateBody.parse(await req.json());
    const site = await createSiteLocal({ name: body.name as string, address: body.address }, auth.ctx);
    return NextResponse.json({ ok: true, site });
  } catch (e) {
    return storeError(e);
  }
}

export async function PATCH(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(2).max(100).optional(), address: z.string().trim().max(200).nullable().optional() }).parse(await req.json());
    const result = await updateSiteLocal(body.id, { name: body.name, address: body.address }, auth.ctx);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return storeError(e);
  }
}

export async function DELETE(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return forbidden("Forbidden — only owners and admins can delete a site");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const result = await deleteSiteLocal(id, auth.ctx);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return storeError(e);
  }
}
