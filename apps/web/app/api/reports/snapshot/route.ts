import { NextResponse } from "next/server";
import { z } from "zod";
import type { ReportNarrative } from "@eval-ai/shared";
import { createReportSnapshotLocal, getSnapshotLocal, listSnapshotsLocal, removeSnapshotPhotosLocal, updateSnapshotNarrativeLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
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
  const snapshotId = url.searchParams.get("snapshotId") ?? undefined;
  try {
    // One whole snapshot, with its pictures (the phone asks for the one it is showing).
    if (snapshotId) {
      const one = await getSnapshotLocal(snapshotId, auth.ctx);
      if (!one) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await verifyAssessmentWorkspace(auth.ctx, one.assessmentId);
      return NextResponse.json({ snapshot: one });
    }
    if (assessmentId) await verifyAssessmentWorkspace(auth.ctx, assessmentId);
    const snapshots = await listSnapshotsLocal(assessmentId, auth.ctx);
    // light=1: a list for a phone, without the HTML copy and the report photos' pictures (they can be several MB per version).
    if (url.searchParams.get("light") === "1") {
      const light = snapshots.map((s) => {
        const { htmlPreview: _html, ...rest } = s;
        void _html;
        const photos = s.payload?.photos?.map((p) => ({ ...p, thumbnail: undefined }));
        return { ...rest, payload: photos ? { ...s.payload, photos } : s.payload, light: true };
      });
      return NextResponse.json({ snapshots: light, count: light.length });
    }
    return NextResponse.json({ snapshots, count: snapshots.length });
  } catch (e) {
    return storeError(e);
  }
}

const NarrativeBody = z
  .object({
    snapshotId: z.string().min(1).max(100),
    narrative: z
      .object({
        summary: z.string().max(5000).optional(),
        siteOverview: z.string().max(5000).optional(),
        keyFindings: z
          .array(
            z.object({
              id: z.string().max(40).optional(),
              title: z.string().min(1).max(160),
              priority: z.enum(["high", "medium", "low", "info"]),
              observed: z.string().max(1500).default(""),
              meaning: z.string().max(1500).default(""),
              action: z.string().max(800).default(""),
              basis: z.array(z.object({ kind: z.enum(["item", "photo", "measurement", "finding"]), ref: z.string().max(200) })).max(12).default([]),
              source: z.enum(["ai", "person"]).default("person"),
              confirmed: z.boolean().optional(),
              evidenceCount: z.number().int().min(0).optional(),
            }),
          )
          .max(20)
          .optional(),
        observations: z.string().max(8000).optional(),
        issues: z.string().max(5000).optional(),
        recommendations: z.string().max(5000).optional(),
        openItems: z.string().max(5000).optional(),
        notes: z.string().max(5000).optional(),
      })
      .optional(),
    /** Evidence ids of photos to take out of this draft. */
    removePhotos: z.array(z.string().max(100)).max(20).optional(),
  })
  .refine((b) => b.narrative || (b.removePhotos && b.removePhotos.length > 0), { message: "Nothing to change" });

/** Edit the human-written sections of a DRAFT report. Finalized reports are immutable. */
export async function PATCH(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = NarrativeBody.parse(await req.json());
    let snapshot;
    if (body.removePhotos && body.removePhotos.length > 0) snapshot = await removeSnapshotPhotosLocal(body.snapshotId, body.removePhotos, auth.ctx);
    // Shape is checked above; the store checks every field again (cleanNarrative) before saving.
    if (body.narrative) snapshot = await updateSnapshotNarrativeLocal(body.snapshotId, body.narrative as ReportNarrative, auth.ctx);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return storeError(e);
  }
}
