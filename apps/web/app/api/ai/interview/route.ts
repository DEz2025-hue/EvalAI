import { NextResponse } from "next/server";
import { z } from "zod";
import { nextInterviewQuestion } from "@eval-ai/ai-adapter";
import { INTERVIEW_LIMITS } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, aiWorkspaceKey } from "../../../../lib/aiRoute";
import { loadInterviewRecord } from "../../../../lib/interviewRecord";

export const maxDuration = 60;

// The conversation so far comes from the phone (it is only text to read, never instructions); the record comes from stored facts.
const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  turns: z.array(z.object({ role: z.enum(["ai", "person"]), text: z.string().min(1).max(INTERVIEW_LIMITS.chars) })).max(INTERVIEW_LIMITS.promptTurns),
  /** All questions asked so far in this interview (the turns above may be only the latest ones). */
  questionsAsked: z.number().int().min(0).max(INTERVIEW_LIMITS.questions),
});

/** Ask the next interview question. Saves nothing: the screen keeps the conversation and stores it with the job. */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "interview", 40);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    const record = await loadInterviewRecord(auth.ctx, body.assessmentId);
    const out = await nextInterviewQuestion({ ...record, workspaceId: aiWorkspaceKey(auth), turns: body.turns, questionsAsked: body.questionsAsked } as never, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json({ ...out, draft: true });
  } catch (e) {
    return aiError(e);
  }
}
