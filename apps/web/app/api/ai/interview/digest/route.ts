import { NextResponse } from "next/server";
import { z } from "zod";
import { digestInterview } from "@eval-ai/ai-adapter";
import { INTERVIEW_LIMITS } from "@eval-ai/shared";
import { requireWriter } from "../../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey } from "../../../../../lib/aiRoute";
import { loadInterviewRecord } from "../../../../../lib/interviewRecord";

export const maxDuration = 60;

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  turns: z.array(z.object({ role: z.enum(["ai", "person"]), text: z.string().min(1).max(INTERVIEW_LIMITS.chars) })).min(2).max(INTERVIEW_LIMITS.turns),
});

/**
 * Read a finished interview and propose what to add to the record: notes for checklist items, finding drafts, site-brief lines,
 * contradictions and open questions. Every proposal carries the person's exact words. Nothing is saved or applied here: the person
 * accepts or removes each one, and spoken words never change a checklist status.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "interview-digest", 10);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    const record = await loadInterviewRecord(auth.ctx, body.assessmentId);
    const out = await digestInterview({ ...record, workspaceId: aiWorkspaceKey(auth), turns: body.turns } as never, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json({ ...out, draft: true, label: "AI proposals from what was said — review each one. Statements are not verified facts." });
  } catch (e) {
    return aiError(e);
  }
}
