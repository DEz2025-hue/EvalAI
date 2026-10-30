import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, workspaceIdFor, storeError, requireWriter } from "../../../lib/auth";
import { verifyAssessmentWorkspace } from "../../../lib/store";

const Item = z.object({
  id: z.string().optional(),
  description: z.string().min(2).max(500),
  specification: z.string().max(500).optional(),
  quantity: z.number().positive().finite(),
  unit: z.string().min(1).max(30),
  rationale: z.string().min(3).max(1000), // traceable
  source: z.enum(["measurement", "finding", "rule", "user_input"]),
  provisional: z.boolean().optional(),
  assumptions: z.array(z.string().max(500)).max(20).optional(),
});

const Body = z.object({ assessmentId: z.string().min(1).max(100), items: z.array(Item).min(1).max(500), version: z.number().optional() });

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    const { saveMaterialsLocal } = await import("../../../lib/store");
    const result = await saveMaterialsLocal(body.assessmentId, body.items as Array<{ description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional?: boolean; assumptions?: string[]; findingId?: string }>, body.version, workspaceIdFor(auth, (body as unknown as { workspaceId?: string }).workspaceId), auth.ctx);
    return NextResponse.json({ ok: true, assessmentId: body.assessmentId, version: result.version, items: body.items.length, provisionalCount: result.provisionalCount, persisted: result.persisted, note: result.persisted ? "Persisted to Supabase — prior quotations now stale" : "Persisted to deterministic file fallback — prior quotations marked stale" });
  } catch (e) {
    return storeError(e);
  }
}

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const id = url.searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  try {
    await verifyAssessmentWorkspace(auth.ctx, id);
    const { getMaterialsLocal } = await import("../../../lib/store");
    const items = await getMaterialsLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, items, count: items.length });
  } catch (e) {
    return storeError(e);
  }
}
