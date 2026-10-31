import { NextResponse } from "next/server";
import { z } from "zod";
import { samSegment } from "@eval-ai/ai-adapter";
import { PHOTO_REFERENCES } from "@eval-ai/shared";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook } from "../../../../lib/aiRoute";
import { verifyAssessmentWorkspace } from "../../../../lib/store";

const Body = z.object({
  imageBase64: z.string().min(1).max(14_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  assessmentId: z.string().max(100).optional(),
  /** Which known-size object to look for. The prompt is chosen here, never taken from the client. */
  reference: z.enum(["a4", "letter", "card"]),
});

/**
 * Find the reference object (a sheet of paper or a card) in a photo and return candidate OUTLINES in pixels.
 * Outlines are not measurements. The person picks the right candidate and the length is computed from it, never by the AI.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "segment", 20);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    if (body.assessmentId) await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const result = await samSegment(
      { imageBase64: body.imageBase64, mimeType: body.mimeType, prompt: PHOTO_REFERENCES[body.reference].samPrompt },
      { onRun: aiRunHook(auth, body.assessmentId) },
    );
    // Best matches first, a handful at most; masks and raw records are not sent to the phone.
    const boxes = [...result.boxes]
      .sort((a, b) => (b.c ?? 0) - (a.c ?? 0))
      .slice(0, 5)
      .map(({ x1, y1, x2, y2, w, h, c }) => ({ x1, y1, x2, y2, w, h, confidence: c ?? null }));
    return NextResponse.json({ boxes, limitations: result.limitations, requiresHumanReview: true });
  } catch (e) {
    return aiError(e);
  }
}
