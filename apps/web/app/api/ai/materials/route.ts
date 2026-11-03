import { NextResponse } from "next/server";
import { z } from "zod";
import { proposeMaterials } from "@eval-ai/ai-adapter";
import { ruleCatalog } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { buildReportInputFromStoredFacts, getMaterialsLocal, listEvidenceLocal, listFindingsLocal } from "../../../../lib/store";
import { buildReportPhotos, type PhotoChoices, type SavedPhotoReview } from "../../../../lib/reportPhotos";
import { resolveMaterialsProposal } from "../../../../lib/materialsDraft";

export const maxDuration = 60;

const Body = z.object({ assessmentId: z.string().min(1).max(100) });

/**
 * Analyse the whole job and propose materials (D-029). The AI chooses what is needed and which documented rule sizes each item; the
 * quantities are calculated here in code. The result is a DRAFT returned to the screen: nothing is saved, nothing is priced, and the
 * person accepts, edits or removes each item before saving it as a new list version.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "materials", 10);
  if (limited) return limited;
  try {
    const { assessmentId } = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const input = (await buildReportInputFromStoredFacts(assessmentId, {}, auth.ctx)).input;
    const { items: evidence } = await listEvidenceLocal(assessmentId, auth.ctx);
    const titleById = new Map(facts.items.map((i) => [i.id, i.title]));
    const ctx = facts.assessment.context;
    // Only photos the person chose, as notes only (D-024). They are unverified.
    const photos = await buildReportPhotos(assessmentId, evidence, ctx.photoReview as Record<string, SavedPhotoReview> | undefined, titleById, ctx.photoChoices as PhotoChoices | undefined, { thumbnails: false });
    const findings = await listFindingsLocal(assessmentId, auth.ctx);
    const existing = await getMaterialsLocal(assessmentId, auth.ctx);
    const goal = input.siteBrief?.goal ?? (typeof input.context.goal === "string" ? input.context.goal : undefined);
    const covers = new Map(facts.items.map((i) => [i.title, i.instructions]));

    const proposal = await proposeMaterials(
      {
        workspaceId: aiWorkspaceKey(auth),
        assessmentId,
        siteName: input.siteName,
        mode: input.mode,
        pack: input.pack,
        scenario: facts.scenario,
        goal: goal?.slice(0, 1000),
        siteBrief: input.siteBrief,
        checklist: input.checklist.map((c) => ({ title: c.title, status: c.status, notes: c.notes, category: c.category, required: c.required, covers: covers.get(c.title) ?? undefined, measured: c.measured, evidenceCount: c.evidenceCount })),
        findings: input.findings.map((f) => ({ title: f.title, severity: f.severity, description: f.description, uncertainty: f.uncertainty })),
        findingsAwaitingReview: findings.filter((f) => f.status === "needs_review").length,
        measurements: input.measurements,
        limitations: input.limitations,
        photos: photos.map((p) => ({ id: p.evidenceId, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues.map((x) => x.text), cannotTell: p.cannotTell })),
        existingMaterials: existing.map((m) => ({ description: m.description, specification: m.specification })),
        rules: ruleCatalog(),
      },
      { onRun: aiRunHook(auth, assessmentId) },
    );
    const draft = resolveMaterialsProposal(proposal);
    return NextResponse.json({ ...draft, draft: true, existingCount: existing.length, label: "AI draft — review and edit before saving. Not a quotation." });
  } catch (e) {
    return aiError(e);
  }
}
