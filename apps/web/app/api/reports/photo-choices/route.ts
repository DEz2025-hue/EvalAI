import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWriter, storeError } from "../../../../lib/auth";
import { getAssessmentLocal, listEvidenceLocal, updateAssessmentContextLocal, verifyAssessmentWorkspace } from "../../../../lib/store";
import { selectReportPhotos, type PhotoChoices } from "../../../../lib/reportPhotos";

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  /** evidence id -> true (add to the report) or false (leave out). */
  choices: z.record(z.boolean()).refine((c) => Object.keys(c).length > 0 && Object.keys(c).length <= 50, "Send between 1 and 50 answers"),
});

/**
 * The person's answer for each photo: add it to the report, or leave it out (D-024). Only photos that belong to this job and
 * fit in a report can be answered. A photo with no answer is never put in a report.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const assessment = await getAssessmentLocal(body.assessmentId, auth.ctx);
    if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { items: evidence } = await listEvidenceLocal(body.assessmentId, auth.ctx);
    const allowed = new Set(selectReportPhotos(evidence).chosen);
    const merged: PhotoChoices = { ...((assessment.context.photoChoices as PhotoChoices | undefined) ?? {}) };
    let saved = 0;
    for (const [id, answer] of Object.entries(body.choices)) {
      if (!allowed.has(id)) continue; // not this job's photo (or beyond the report limit): ignored
      merged[id] = answer;
      saved += 1;
    }
    if (saved === 0) return NextResponse.json({ error: "None of those photos belong to this job" }, { status: 400 });
    await updateAssessmentContextLocal(body.assessmentId, { context: { photoChoices: merged } }, auth.ctx);
    return NextResponse.json({ ok: true, saved, choices: merged });
  } catch (e) {
    return storeError(e);
  }
}
