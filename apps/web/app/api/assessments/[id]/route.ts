import { NextResponse } from "next/server";
import { getAssessmentLocal, getResponsesLocal, getChecklistItemsLocal } from "../../../../lib/store";
import { requireAuth, storeError } from "../../../../lib/auth";

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
    const checklist = stored.map((it) => ({ id: it.id, title: it.title, instructions: it.instructions, required: it.required, category: it.category }));
    return NextResponse.json({ ...assessment, checklist, responses, note: "Checklist from stored items — RLS when workspaceId present" });
  } catch (e) {
    return storeError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const { id } = params;
  try {
    const body = await req.json();
    const { verifyAssessmentWorkspace, updateAssessmentContextLocal } = await import("../../../../lib/store");
    await verifyAssessmentWorkspace(auth.ctx, id);
    const ok = await updateAssessmentContextLocal(id, { siteName: body.siteName, context: body.context }, auth.ctx);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return storeError(e);
  }
}
