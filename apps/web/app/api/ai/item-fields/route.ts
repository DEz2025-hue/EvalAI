import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestItemFields } from "@eval-ai/ai-adapter";
import { aiFieldsFor } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, loadAssessmentFacts } from "../../../../lib/aiRoute";

export const maxDuration = 60;

const Body = z.object({ assessmentId: z.string().min(1).max(100), itemId: z.string().min(1).max(100), notes: z.string().trim().min(1).max(2000) });

/**
 * Suggest answers to a checklist item's simple fields from the person's own notes (D-042). The server decides which fields can be offered. Nothing is saved
 * here: the screen shows each suggestion, with the words it came from, and the person accepts it.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "item-fields", 20);
  if (limited) return limited;
  try {
    const { assessmentId, itemId, notes } = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, assessmentId);
    const item = facts.items.find((i) => i.id === itemId);
    if (!item) return NextResponse.json({ error: "This checklist item no longer exists — reload the checklist" }, { status: 400 });
    const fields = aiFieldsFor(item.title);
    if (fields.length === 0) return NextResponse.json({ suggestions: [], requiresHumanReview: true });
    return NextResponse.json(await suggestItemFields({ title: item.title, fields, notes }, { onRun: aiRunHook(auth, assessmentId) }));
  } catch (e) {
    return aiError(e);
  }
}
