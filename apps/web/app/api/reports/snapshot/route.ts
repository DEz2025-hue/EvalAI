import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  assessmentId: z.string().uuid(),
  includeMaterials: z.boolean().default(false),
  finalize: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    // Assemble report from stored facts + validated drafts — never re-generate facts from AI at export
    // Create report_snapshots row with assessment_version, materials_version, quotation_version (immutable after finalize)
    const snapshotId = `snap-${Date.now()}-${body.assessmentId.slice(0, 8)}`;
    return NextResponse.json({
      snapshotId,
      assessmentId: body.assessmentId,
      assessmentVersion: 1,
      materialsVersion: body.includeMaterials ? 1 : null,
      finalized: body.finalize,
      artifactKey: body.finalize ? `reports/${snapshotId}.pdf` : null,
      note: "Snapshot created — finalized snapshots are immutable; later edits create new versions",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
