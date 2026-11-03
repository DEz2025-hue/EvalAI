import { NextResponse } from "next/server";
import { z } from "zod";
import { draftReportNarrative, draftReportSummary } from "@eval-ai/ai-adapter";
import { checklistGlance, keyFindingsFor, type ReportInput, type ReportKeyFinding } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { buildReportInputFromStoredFacts, getSnapshotLocal, listEvidenceLocal, listFindingsLocal } from "../../../../lib/store";
import { buildReportPhotos, type PhotoChoices, type SavedPhotoReview } from "../../../../lib/reportPhotos";

// Writing a whole report can take most of a minute.
export const maxDuration = 60;

// snapshotId: write the report for THIS draft, so it describes exactly what the draft shows (and not photos a reviewer removed).
// stage "analyze" (default): the key findings, executive summary, site overview and open items, from the saved record.
// stage "summary": only the executive summary and open items, from the key findings as the person has edited and saved them.
const Body = z.object({ assessmentId: z.string().min(1).max(100), snapshotId: z.string().max(100).optional(), stage: z.enum(["analyze", "summary"]).default("analyze") });

/**
 * Draft the written part of a report: key findings (related observations, measurements and photos combined, with what they mean and what
 * to do), an executive summary, a site overview and open items. The text is a draft: it is returned to the editor, not stored here, and a
 * person must edit and sign off the report. Findings nobody has confirmed are only counted, never described.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "report", 10);
  if (limited) return limited;
  try {
    const { assessmentId, snapshotId, stage } = Body.parse(await req.json());
    if (stage === "summary" && !snapshotId) return NextResponse.json({ error: "Rewriting the summary needs a report draft" }, { status: 400 });
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);

    // One source of truth: the draft's saved report content, or (with no draft yet) the same builder the draft is made with.
    let input: ReportInput;
    if (snapshotId) {
      const draft = await getSnapshotLocal(snapshotId, auth.ctx);
      if (!draft || draft.assessmentId !== assessmentId) return NextResponse.json({ error: "That report draft was not found" }, { status: 404 });
      if (draft.finalized) return NextResponse.json({ error: "A finalized report can't be rewritten — create a new draft" }, { status: 409 });
      input = draft.payload;
    } else {
      const built = (await buildReportInputFromStoredFacts(assessmentId, {}, auth.ctx)).input;
      const { items: evidence } = await listEvidenceLocal(assessmentId, auth.ctx);
      const titleById = new Map(facts.items.map((i) => [i.id, i.title]));
      const ctx = facts.assessment.context;
      // Only photos the person chose to add (D-024), as notes only: no pictures are read for this.
      const photos = await buildReportPhotos(assessmentId, evidence, ctx.photoReview as Record<string, SavedPhotoReview> | undefined, titleById, ctx.photoChoices as PhotoChoices | undefined, { thumbnails: false });
      input = { ...built, photos };
    }

    const findings = await listFindingsLocal(assessmentId, auth.ctx);
    const glance = checklistGlance(input.checklist);
    const awaiting = findings.filter((f) => f.status === "needs_review").length;
    const goal = input.siteBrief?.goal ?? (typeof input.context.goal === "string" ? input.context.goal : undefined);
    const common = {
      workspaceId: aiWorkspaceKey(auth),
      assessmentId,
      siteName: input.siteName,
      mode: input.mode,
      pack: input.pack,
      scenario: facts.scenario,
      siteBrief: input.siteBrief,
      glance: {
        total: glance.total,
        checked: glance.checked,
        pass: glance.counts.pass,
        issue: glance.counts.fail,
        needsAttention: glance.counts.needs_attention,
        notApplicable: glance.counts.not_applicable,
        notChecked: glance.counts.not_checked,
        requiredNotChecked: glance.requiredOpen.length,
      },
      limitations: input.limitations,
      findingsAwaitingReview: awaiting,
    };
    const onRun = aiRunHook(auth, assessmentId);

    if (stage === "summary") {
      const current = keyFindingsFor(input);
      const out = await draftReportSummary({ ...common, keyFindings: current.map((f) => ({ title: f.title, priority: f.priority, observed: f.observed, meaning: f.meaning, action: f.action })) }, { onRun });
      return NextResponse.json({ ...out, draft: true, stage, label: "AI draft — review and edit before saving" });
    }

    const covers = new Map(facts.items.map((i) => [i.title, i.instructions]));
    const out = await draftReportNarrative(
      {
        ...common,
        goal: goal?.slice(0, 1000),
        checklist: input.checklist.map((c) => ({ title: c.title, status: c.status, notes: c.notes, category: c.category, required: c.required, covers: covers.get(c.title) ?? undefined, measured: c.measured, evidenceCount: c.evidenceCount })),
        findings: input.findings.map((f) => ({ title: f.title, severity: f.severity, description: f.description, uncertainty: f.uncertainty })),
        measurements: input.measurements,
        materials: input.materials ?? [],
        photos: (input.photos ?? []).map((p) => ({ id: p.evidenceId, itemTitle: p.itemTitle, caption: p.caption, observations: p.observations, possibleIssues: p.possibleIssues.map((x) => x.text), cannotTell: p.cannotTell })),
      },
      { onRun },
    );
    // The adapter already checked every field and source; the web app's type settings just make zod's result look optional.
    const keyFindings = out.keyFindings.map((f, i) => ({ id: `f${i + 1}`, ...f, source: "ai" })) as ReportKeyFinding[];
    return NextResponse.json({ ...out, keyFindings, draft: true, stage, label: "AI draft — review and edit before saving" });
  } catch (e) {
    return aiError(e);
  }
}
