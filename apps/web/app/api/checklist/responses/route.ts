import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanAnswers, responseProblem } from "@eval-ai/shared";
import { saveResponsesLocal, getResponsesLocal, getChecklistItemsLocal, verifyAssessmentWorkspace, type ResponseInput } from "../../../../lib/store";
import { requireAuth, storeError, requireWriter } from "../../../../lib/auth";

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  responses: z.array(z.object({
    itemId: z.string().min(1).max(100),
    status: z.enum(["pass", "fail", "needs_attention", "not_applicable", "not_checked"]),
    notes: z.string().max(2000).optional(),
    measuredValue: z.number().finite().optional(),
    measuredUnit: z.string().max(20).optional(),
    /** Answers to the item's simple fields (D-042). Only the item's own fields and choices are kept. */
    answers: z.record(z.union([z.string().max(120), z.number()])).optional(),
    /** The answer's saved time as the screen loaded it (null = never saved). A newer stored answer makes the save a 409. */
    baseUpdatedAt: z.string().max(40).nullable().optional(),
  })).max(500),
});

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    // Enforce: Not Checked must stay distinguishable from Pass; never auto-convert — exit gate invariant
    for (const r of body.responses) {
      if (!["pass", "fail", "needs_attention", "not_applicable", "not_checked"].includes(r.status)) throw new Error(`Invalid status ${r.status}`);
    }
    // The same answer rules as the screens, enforced here so no client can skip them.
    await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const items = new Map((await getChecklistItemsLocal(body.assessmentId, auth.ctx)).map((it) => [it.id, it]));
    for (const r of body.responses) {
      const item = items.get(r.itemId);
      if (!item) return NextResponse.json({ error: "This checklist item no longer exists — reload the checklist" }, { status: 400 });
      const problem = responseProblem({ status: r.status as string, notes: r.notes, measuredValue: r.measuredValue, measuredUnit: r.measuredUnit, answers: r.answers }, item);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    const cleaned = body.responses.map((r) => ({ ...r, answers: r.answers ? cleanAnswers(items.get(r.itemId)!.title, r.answers) : undefined }));
    const result = await saveResponsesLocal(body.assessmentId, cleaned as ResponseInput[], auth.ctx);
    return NextResponse.json({ ok: true, assessmentId: body.assessmentId, saved: result.saved, persisted: result.persisted, updatedAt: result.updatedAt });
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
    const responses = await getResponsesLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, responses });
  } catch (e) {
    return storeError(e);
  }
}
