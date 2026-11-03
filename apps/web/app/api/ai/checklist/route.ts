import { NextResponse } from "next/server";
import { z } from "zod";
import { sparkProposeChecklist } from "@eval-ai/ai-adapter";
import { checklistFor, lookForFor } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";

// Proposals are suggestions only (source = ai_suggested) and are never saved until the user confirms the checklist.
// currentItems: what the builder screen shows right now, including edits and suggestions that are not saved yet, so the AI is told about them too.
const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  maxItems: z.number().int().min(5).max(50).optional(),
  currentItems: z.array(z.object({ title: z.string().max(500), instructions: z.string().max(2000).optional(), category: z.string().max(100).optional() })).max(200).optional(),
});

type Known = { title: string; covers?: string; category?: string };

/**
 * Everything the checklist already has, so the AI only adds what is missing: the saved items, anything on the builder screen that is not
 * saved yet, and (when nothing is saved) the pack's own template, so the template is never proposed back as "new".
 */
function existingChecklist(facts: { items: Array<{ title: string; instructions?: string | null; category?: string | null }>; assessment: { pack: "solar" | "cctv" }; scenario?: string }, current?: Array<{ title: string; instructions?: string; category?: string }>): Known[] {
  const byTitle = new Map<string, Known>();
  const add = (title: string, covers?: string | null, category?: string | null) => {
    const key = title.trim().toLowerCase();
    if (!key) return;
    const prev = byTitle.get(key);
    byTitle.set(key, { title: prev?.title ?? title.trim(), covers: (covers || prev?.covers) ?? undefined, category: (category || prev?.category) ?? undefined });
  };
  for (const i of facts.items) add(i.title, i.instructions, i.category);
  for (const i of current ?? []) add(i.title, i.instructions, i.category);
  if (byTitle.size === 0) for (const t of checklistFor(facts.assessment.pack, facts.scenario as never)) add(t, lookForFor(t));
  return [...byTitle.values()];
}

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "checklist");
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, body.assessmentId);
    const ctx = facts.assessment.context as Record<string, unknown>;
    const result = await sparkProposeChecklist({
      workspaceId: aiWorkspaceKey(auth),
      assessmentId: body.assessmentId,
      mode: facts.assessment.mode,
      pack: facts.assessment.pack,
      context: { ...ctx, scenario: facts.scenario },
      scenario: facts.scenario,
      answers: (ctx.clarificationAnswers as Record<string, unknown> | undefined) ?? undefined,
      existingChecklist: existingChecklist(facts, body.currentItems as Array<{ title: string; instructions?: string; category?: string }> | undefined),
      maxItems: body.maxItems ?? 20,
    }, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json(result);
  } catch (e) {
    return aiError(e);
  }
}
