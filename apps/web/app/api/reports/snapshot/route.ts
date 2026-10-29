import { NextResponse } from "next/server";
import { z } from "zod";
import { createReportSnapshotLocal, listSnapshotsLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { requireAuth, workspaceIdFor, storeError } from "../../../../lib/auth";

const Body = z.object({
  assessmentId: z.string().min(3),
  workspaceId: z.string().uuid().optional().nullable(),
  includeMaterials: z.boolean().default(false),
  finalize: z.boolean().default(false),
  limitations: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const { snapshot, input, persisted } = await createReportSnapshotLocal({
      assessmentId: body.assessmentId,
      workspaceId: workspaceIdFor(auth, body.workspaceId),
      includeMaterials: body.includeMaterials,
      limitations: body.limitations,
      finalize: body.finalize,
      ctx: auth.ctx,
    });
    return NextResponse.json({
      snapshot,
      input,
      persisted,
      note: snapshot.finalized
        ? "Snapshot finalized — immutable. Later edits create new snapshots, never mutate this one (Phase 6 exit gate)"
        : "Draft snapshot — finalize to make immutable",
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
