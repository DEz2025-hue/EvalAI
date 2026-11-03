import { NextResponse } from "next/server";
import { z } from "zod";
import { InterviewStateSchema, scenarioFor } from "@eval-ai/shared";
import { getAssessmentLocal, getResponsesLocal, getChecklistItemsLocal, getDeletionInfo, deleteAssessmentLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { requireAuth, storeError, requireWriter, isAdmin } from "../../../../lib/auth";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { id } = params;
  try {
    const assessment = await getAssessmentLocal(id, auth.ctx);
    if (!assessment) return NextResponse.json({ error: "Not found", id }, { status: 404 });
    // Cross-workspace reads are blocked: the stored workspace must match the request workspace.
    if (auth.mode === "authenticated" && assessment.workspaceId && assessment.workspaceId !== auth.ctx.workspaceId) {
      return NextResponse.json({ error: "Forbidden — outside your workspace" }, { status: 403 });
    }
    const responses = await getResponsesLocal(id, auth.ctx);
    const stored = await getChecklistItemsLocal(id, auth.ctx);
    const checklist = stored.map((it) => ({ id: it.id, title: it.title, instructions: it.instructions, required: it.required, category: it.category, source: it.source, rationale: it.rationale }));
    return NextResponse.json({ ...assessment, checklist, responses, note: "Checklist from stored items — RLS when workspaceId present" });
  } catch (e) {
    return storeError(e);
  }
}

const PatchBody = z.object({
  siteName: z.string().trim().min(2).max(100).optional(),
  context: z.record(z.unknown()).refine((c) => JSON.stringify(c).length <= 50_000, "context is too large").optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const { id } = params;
  try {
    const body = PatchBody.parse(await req.json());
    const { updateAssessmentContextLocal } = await import("../../../../lib/store");
    await verifyAssessmentWorkspace(auth.ctx, id);
    let context = body.context;
    // A stored interview must be a valid conversation (bounded turns and text), not arbitrary data.
    if (context && "interview" in context) context = { ...context, interview: InterviewStateSchema.parse(context.interview) };
    if (context && "scenario" in context) {
      // The situation can be set once (older jobs have none); an inspection is always an existing system.
      const current = await getAssessmentLocal(id, auth.ctx);
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const wanted = scenarioFor(current.mode, context.scenario);
      if (!wanted) return NextResponse.json({ error: "Choose New installation or Existing system" }, { status: 400 });
      const stored = scenarioFor(current.mode, current.context.scenario);
      if (stored && stored !== wanted) return NextResponse.json({ error: "The situation is already set for this job" }, { status: 409 });
      context = { ...context, scenario: wanted };
    }
    const ok = await updateAssessmentContextLocal(id, { siteName: body.siteName, context }, auth.ctx);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return storeError(e);
  }
}

const DeleteBody = z.object({ confirmName: z.string().max(200).optional() });

/**
 * Permanently deletes a job (decision D-020). Owners and admins only. A job with a finalized (signed) report also needs the
 * site name typed back, checked here as well as in the app, because that report is destroyed with it.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Only an owner or admin can delete a job" }, { status: 403 });
  const { id } = params;
  try {
    const body = DeleteBody.parse(await req.json().catch(() => ({})));
    await verifyAssessmentWorkspace(auth.ctx, id);
    const info = await getDeletionInfo(id, auth.ctx);
    if (!info) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (info.hasFinalizedReport && (body.confirmName ?? "").trim().toLowerCase() !== info.siteName.trim().toLowerCase()) {
      return NextResponse.json({ error: "Type the site name exactly to delete a job with a finalized report", needsConfirmName: true }, { status: 400 });
    }
    const result = await deleteAssessmentLocal(id, auth.ctx);
    return NextResponse.json({ ok: true, id, hadFinalizedReport: result.hadFinalizedReport });
  } catch (e) {
    return storeError(e);
  }
}
