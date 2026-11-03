import { NextResponse } from "next/server";
import { z } from "zod";
import { liveFrame } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, loadAssessmentFacts } from "../../../../lib/aiRoute";

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  // A small still from the live session (the phone shrinks it first). 4 MB of base64 is far more than needed.
  imageBase64: z.string().min(1).max(4_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  currentItemId: z.string().max(100).optional(),
  /** Notes already shown, so the AI doesn't repeat them. They are data for the model, not instructions. */
  previousNotes: z.array(z.string().max(400)).max(5).default([]),
});

/**
 * One frame from a live session -> reviewable NOTES (suggestions only: never a measurement, pass/fail or finding).
 * The checklist is built here from stored facts, so the phone can't feed the model invented items or states, and only
 * real checklist ids can come back. Nothing from the frame is stored or logged; the person saves what they want.
 * A tighter rate limit than the other AI routes: a session sends a frame every 10-30 seconds.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "live-frame", 8);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, body.assessmentId);
    const byItem = new Map(facts.responses.map((r) => [r.itemId, r.status]));
    const checklist = facts.items.map((it) => ({ id: it.id, title: it.title, status: byItem.get(it.id) ?? "not_checked" }));
    const currentItemId = body.currentItemId && checklist.some((c) => c.id === body.currentItemId) ? body.currentItemId : undefined;
    const result = await liveFrame(
      { imageBase64: body.imageBase64, mimeType: body.mimeType, mode: facts.assessment.mode, pack: facts.assessment.pack, scenario: facts.scenario, checklist, currentItemId, currentLookFor: currentItemId ? facts.items.find((i) => i.id === currentItemId)?.instructions : undefined, previousNotes: body.previousNotes },
      { onRun: aiRunHook(auth, body.assessmentId) },
    );
    return NextResponse.json({ ...result, label: "AI suggestion — needs your review" });
  } catch (e) {
    return aiError(e);
  }
}
