import type { StoreCtx } from "./store";
import { buildReportInputFromStoredFacts, listFindingsLocal } from "./store";
import { loadAssessmentFacts } from "./aiRoute";

/**
 * The saved record of a job as the interview reads it: the site brief, the checklist with its results, notes and guidance, the recorded
 * measurements, and how many findings are confirmed. Built from stored facts only (never from what the phone says), so the interview
 * cannot be steered by edited text. Unconfirmed findings are not described.
 */
export async function loadInterviewRecord(ctx: StoreCtx, assessmentId: string) {
  const facts = await loadAssessmentFacts(ctx, assessmentId);
  const input = (await buildReportInputFromStoredFacts(assessmentId, {}, ctx)).input;
  const findings = await listFindingsLocal(assessmentId, ctx);
  const covers = new Map(facts.items.map((i) => [i.title, i.instructions]));
  const goal = input.siteBrief?.goal ?? (typeof input.context.goal === "string" ? input.context.goal : undefined);
  return {
    assessmentId,
    siteName: input.siteName,
    mode: input.mode,
    pack: input.pack,
    scenario: facts.scenario,
    goal: goal?.slice(0, 1000),
    siteBrief: input.siteBrief,
    checklist: input.checklist.map((c) => ({ title: c.title, status: c.status, notes: c.notes, category: c.category, required: c.required, covers: covers.get(c.title) ?? undefined })),
    measurements: input.measurements,
    findingCount: findings.filter((f) => f.status !== "needs_review").length,
  };
}
