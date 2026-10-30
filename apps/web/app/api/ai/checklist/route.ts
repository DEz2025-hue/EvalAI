import { NextResponse } from "next/server";
import { z } from "zod";
import { sparkProposeChecklist } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";

// Proposals are suggestions only (source = ai_suggested) and are never saved until the user confirms the checklist.
const Body = z.object({ assessmentId: z.string().min(1).max(100), maxItems: z.number().int().min(5).max(50).optional() });

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
      context: ctx,
      answers: (ctx.clarificationAnswers as Record<string, unknown> | undefined) ?? undefined,
      existingChecklist: facts.items.map((i) => ({ title: i.title })),
      maxItems: body.maxItems ?? 20,
    }, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json(result);
  } catch (e) {
    return aiError(e);
  }
}
