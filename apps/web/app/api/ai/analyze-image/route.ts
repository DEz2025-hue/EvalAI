import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeImage } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, loadAssessmentFacts } from "../../../../lib/aiRoute";
import { photoJobContext } from "../../../../lib/photoContext";

// A photo is studied with more reasoning now (D-035); allow the full serverless time.
export const maxDuration = 60;

const Body = z.object({
  imageBase64: z.string().min(1).max(14_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  assessmentId: z.string().max(100).optional(),
  /** The checklist item the photo is for. Checked against the job on the server. */
  itemId: z.string().max(100).optional(),
  prompt: z.string().max(500).optional(),
});

/**
 * One photo -> a SUGGESTION (never a verified measurement, count or compliance result). With a job, the server sends the AI the job and
 * the checklist item the photo belongs to (D-035), so the photo is read for that purpose: a roof for panel placement, an appliance for
 * the load list. The client only names the job and the item.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "image", 30);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    let context;
    if (body.assessmentId) {
      // loadAssessmentFacts checks the job belongs to this workspace; an item id that is not on the job is simply not used.
      const facts = await loadAssessmentFacts(auth.ctx, body.assessmentId);
      context = photoJobContext(facts, body.itemId);
    }
    const result = await analyzeImage({ imageBase64: body.imageBase64, mimeType: body.mimeType, prompt: body.prompt, context }, { onRun: aiRunHook(auth, body.assessmentId) });
    return NextResponse.json({ ...result, itemTitle: context?.item?.title ?? null, mimeType: body.mimeType });
  } catch (e) {
    return aiError(e);
  }
}
