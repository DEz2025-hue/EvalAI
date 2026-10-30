import { NextResponse } from "next/server";
import { z } from "zod";
import { saveFindingLocal, listFindingsLocal, updateFindingStatusLocal, verifyAssessmentWorkspace } from "../../../lib/store";
import { requireAuth, storeError, requireWriter } from "../../../lib/auth";

const Body = z.object({
  assessmentId: z.string(),
  title: z.string().min(3).max(300),
  description: z.string().max(5000).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  evidenceRefs: z.array(z.string()).max(50).optional(),
});

/** Persist a human-reviewed finding (AI drafts arrive here only after user presses Save). */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    const { finding, persisted } = await saveFindingLocal({ assessmentId: body.assessmentId, title: body.title, description: body.description, severity: body.severity, evidenceRefs: body.evidenceRefs, ctx: auth.ctx });
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
    const body = z.object({ id: z.string(), status: z.enum(["needs_review", "confirmed", "rejected"]) }).parse(await req.json());
    const finding = await updateFindingStatusLocal(body.id, body.status, auth.ctx);
    return NextResponse.json({ ok: true, finding });
  } catch (e) {
    return storeError(e);
  }
}
