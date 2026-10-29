import { NextResponse } from "next/server";
import { z } from "zod";
import { getChecklistItemsLocal, replaceChecklistItemsLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { requireAuth, storeError } from "../../../../lib/auth";

const Item = z.object({
  title: z.string().min(1).max(500),
  instructions: z.string().max(2000).optional(),
  required: z.boolean().optional(),
  category: z.string().max(100).optional(),
});

const PutBody = z.object({
  assessmentId: z.string(),
  items: z.array(Item).min(1).max(200),
});

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const id = url.searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  try {
    await verifyAssessmentWorkspace(auth.ctx, id);
    const items = await getChecklistItemsLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, items, count: items.length });
  } catch (e) {
    return storeError(e);
  }
}

/** Replace the assessment's checklist (builder confirm / editor add). Returns rows with real ids. */
export async function PUT(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const body = PutBody.parse(await req.json());
    const { items, persisted } = await replaceChecklistItemsLocal(body.assessmentId, body.items.map((it) => ({ title: it.title ?? "", instructions: it.instructions, required: it.required, category: it.category })), auth.ctx);
    return NextResponse.json({ ok: true, assessmentId: body.assessmentId, items, count: items.length, persisted });
  } catch (e) {
    return storeError(e);
  }
}
