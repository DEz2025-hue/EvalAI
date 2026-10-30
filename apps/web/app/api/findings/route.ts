import { NextResponse } from "next/server";
import { z } from "zod";
import { saveFindingLocal, listFindingsLocal, updateFindingStatusLocal, verifyAssessmentWorkspace, listEvidenceLocal } from "../../../lib/store";
import { requireAuth, storeError, requireWriter } from "../../../lib/auth";

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  title: z.string().min(3).max(300),
  description: z.string().max(5000).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  evidenceRefs: z.array(z.string().max(100)).max(50).optional(),
  uncertainty: z.string().max(500).optional(),
  missingInputs: z.array(z.string().max(300)).max(20).optional(),
});

/** Persist a human-reviewed finding (AI drafts arrive here only after user presses Save). */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    // Evidence references must point at real evidence for THIS assessment — no fabricated or foreign ids.
    if (body.evidenceRefs && body.evidenceRefs.length > 0) {
      const { items } = await listEvidenceLocal(body.assessmentId, auth.ctx);
      const known = new Set(items.map((e) => e.id));
      const unknown = body.evidenceRefs.filter((r) => !known.has(r));
      if (unknown.length > 0) throw new Error("Unknown evidence reference — link only evidence uploaded to this job");
    }
    const { finding, persisted } = await saveFindingLocal({ assessmentId: body.assessmentId, title: body.title, description: body.description, severity: body.severity, evidenceRefs: body.evidenceRefs, uncertainty: body.uncertainty, missingInputs: body.missingInputs, ctx: auth.ctx });
    return NextResponse.json({ ok: true, finding, persisted, note: "Finding stored as needs_review — never auto-verified" });
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
    const findings = await listFindingsLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, findings, count: findings.length });
  } catch (e) {
    return storeError(e);
  }
}

/** Review a finding: needs_review -> confirmed | rejected. Never auto-verified. */
export async function PATCH(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = z.object({ id: z.string().min(1).max(100), status: z.enum(["needs_review", "confirmed", "rejected"]) }).parse(await req.json());
    const finding = await updateFindingStatusLocal(body.id, body.status, auth.ctx);
    return NextResponse.json({ ok: true, finding });
  } catch (e) {
    return storeError(e);
  }
}
