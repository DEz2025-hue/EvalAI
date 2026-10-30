import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeImage } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook } from "../../../../lib/aiRoute";
import { verifyAssessmentWorkspace } from "../../../../lib/store";

const Body = z.object({
  imageBase64: z.string().min(1).max(14_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  assessmentId: z.string().max(100).optional(),
  prompt: z.string().max(500).optional(),
});

/** One photo -> a SUGGESTION (never a measurement, count or compliance result). */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "image", 30);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    if (body.assessmentId) await verifyAssessmentWorkspace(auth.ctx, body.assessmentId);
    const result = await analyzeImage({ imageBase64: body.imageBase64, mimeType: body.mimeType, prompt: body.prompt }, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json({ ...result, mimeType: body.mimeType });
  } catch (e) {
    return aiError(e);
  }
}
