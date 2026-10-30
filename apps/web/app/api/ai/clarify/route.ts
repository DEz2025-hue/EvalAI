import { NextResponse } from "next/server";
import { z } from "zod";
import { sparkClarifyContext } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey, loadAssessmentFacts } from "../../../../lib/aiRoute";

// The client sends only an assessment id (plus optional unsaved form context). Mode, pack, checklist
// and workspace are taken from stored, verified data.
const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  context: z.record(z.unknown()).refine((c) => JSON.stringify(c).length <= 20_000, "context is too large").optional(),
});

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "clarify");
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, body.assessmentId);
    const result = await sparkClarifyContext({
      workspaceId: aiWorkspaceKey(auth),
      assessmentId: body.assessmentId,
      mode: facts.assessment.mode,
      pack: facts.assessment.pack,
      context: { ...facts.assessment.context, ...(body.context ?? {}) },
      existingChecklist: facts.items.map((i) => ({ title: i.title })),
    }, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json(result);
  } catch (e) {
    return aiError(e);
  }
}
