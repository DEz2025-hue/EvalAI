import { NextResponse } from "next/server";
import { z } from "zod";
import { wonderAnalyzeAssessment } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiWorkspaceKey, loadAssessmentFacts, onlyKnownRefs } from "../../../../lib/aiRoute";

// Analysis input is built from stored facts only; the browser sends just the assessment id.
const Body = z.object({ assessmentId: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const { assessmentId } = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const byItem = new Map(facts.responses.map((r) => [r.itemId, r]));
    const checklistResponses = facts.items.map((it) => {
      const r = byItem.get(it.id);
      return { itemId: it.id, title: it.title, status: r?.status ?? ("not_checked" as const), notes: r?.notes, measuredValue: r?.measuredValue, measuredUnit: r?.measuredUnit };
    });
    const raw = await wonderAnalyzeAssessment({
      workspaceId: aiWorkspaceKey(auth),
      assessmentId,
      checklistResponses,
      evidenceRefs: facts.evidenceIds,
      mode: facts.assessment.mode,
      pack: facts.assessment.pack,
    });
    // Never return provider error detail; drop any evidence reference that is not real evidence for this job.
    const { _error: _ignored, ...result } = raw as typeof raw & { _error?: string };
    void _ignored;
    return NextResponse.json({
      ...result,
      potentialFindings: (result.potentialFindings ?? []).map((f) => ({ ...f, evidenceRefs: onlyKnownRefs(f.evidenceRefs, facts.evidenceIds) })),
      evidenceReferences: onlyKnownRefs(result.evidenceReferences, facts.evidenceIds),
      draft: true,
      label: "AI draft — requires human review",
    });
  } catch (e) {
    return aiError(e);
  }
}
