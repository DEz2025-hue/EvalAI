import { NextResponse } from "next/server";
import { z } from "zod";
import { createReportSnapshotLocal, listSnapshotsLocal, updateSnapshotNarrativeLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { requireAuth, workspaceIdFor, storeError, requireWriter } from "../../../../lib/auth";

const Body = z.object({
  assessmentId: z.string().min(3),
  workspaceId: z.string().uuid().optional().nullable(),
  includeMaterials: z.boolean().default(false),
  limitations: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const { snapshot, input, persisted } = await createReportSnapshotLocal({
      assessmentId: body.assessmentId,
      workspaceId: workspaceIdFor(auth, body.workspaceId),
      includeMaterials: body.includeMaterials,
      limitations: body.limitations,
      ctx: auth.ctx,
    });
    return NextResponse.json({
      snapshot,
      input,
      persisted,
      note: "Draft snapshot — edit the narrative, review it, then sign off to finalize (finalized reports are immutable).",
    });
  } catch (e) {
    return storeError(e);
  }
}

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const assessmentId = url.searchParams.get("assessmentId") ?? undefined;
  try {
    if (assessmentId) await verifyAssessmentWorkspace(auth.ctx, assessmentId);
    const snapshots = await listSnapshotsLocal(assessmentId, auth.ctx);
    return NextResponse.json({ snapshots, count: snapshots.length });
  } catch (e) {
    return storeError(e);
  }
}

const NarrativeBody = z.object({
  snapshotId: z.string().min(1).max(100),
  narrative: z.object({
    summary: z.string().max(5000).optional(),
    recommendations: z.string().max(5000).optional(),
    notes: z.string().max(5000).optional(),
  }),
});

/** Edit the human-written sections of a DRAFT report. Finalized reports are immutable. */
export async function PATCH(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = NarrativeBody.parse(await req.json());
    const snapshot = await updateSnapshotNarrativeLocal(body.snapshotId, body.narrative, auth.ctx);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return storeError(e);
  }
}
