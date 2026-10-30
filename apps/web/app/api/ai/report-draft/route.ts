import { NextResponse } from "next/server";
import { z } from "zod";
import { draftReportNarrative } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { listFindingsLocal, listMeasurementsLocal } from "../../../../lib/store";

const Body = z.object({ assessmentId: z.string().min(1).max(100) });

/**
 * Suggest a summary and recommendations from the CONFIRMED facts only. The text is a draft: it is returned to the
 * editor, not stored, and a person must edit and sign off the report.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "report", 10);
  if (limited) return limited;
  try {
    const { assessmentId } = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const [findings, measurements] = await Promise.all([listFindingsLocal(assessmentId, auth.ctx), listMeasurementsLocal(assessmentId, auth.ctx)]);
    const titleById = new Map(facts.items.map((i) => [i.id, i.title]));
    const byItem = new Map(facts.responses.map((r) => [r.itemId, r]));
    const draft = await draftReportNarrative(
      {
        workspaceId: aiWorkspaceKey(auth),
        assessmentId,
        siteName: facts.assessment.siteName,
        mode: facts.assessment.mode,
        pack: facts.assessment.pack,
        goal: typeof facts.assessment.context.goal === "string" ? facts.assessment.context.goal : undefined,
        checklist: facts.items.map((it) => ({ title: it.title, status: byItem.get(it.id)?.status ?? "not_checked", notes: byItem.get(it.id)?.notes })),
        findings: findings.filter((f) => f.status === "confirmed").map((f) => ({ title: f.title, severity: f.severity, description: f.description, uncertainty: f.uncertainty })),
        measurements: measurements.map((m) => ({ name: m.name || titleById.get(m.itemId ?? "") || "Measurement", value: m.value, unit: m.unit })),
        limitations: [],
      },
      { onRun: aiRunHook(auth, assessmentId) },
    );
    return NextResponse.json({ ...draft, draft: true, label: "AI draft — review and edit before saving" });
  } catch (e) {
    return aiError(e);
  }
}
