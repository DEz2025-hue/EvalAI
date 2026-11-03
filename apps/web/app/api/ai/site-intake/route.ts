import { NextResponse } from "next/server";
import { z } from "zod";
import { siteIntake, INTAKE_MAX_IMAGES } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";
import { aiError, aiGuard, aiRunHook, loadAssessmentFacts, onlyKnownRefs } from "../../../../lib/aiRoute";

// Up to 20 photos in one call can take most of a minute.
export const maxDuration = 60;

const Body = z
  .object({
    assessmentId: z.string().min(1).max(100),
    /** What the person typed or said. Data for the model, not instructions. */
    description: z.string().max(2000).default(""),
    /** Small copies (about 1024 px) of the photos. The originals are uploaded as evidence by the phone. */
    images: z
      .array(z.object({ imageBase64: z.string().min(1).max(2_500_000), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg") }))
      .max(INTAKE_MAX_IMAGES)
      .default([]),
    /** Evidence ids of the saved originals, echoed back only if they really belong to this job. */
    evidenceIds: z.array(z.string().max(100)).max(INTAKE_MAX_IMAGES).default([]),
  })
  .refine((b) => b.description.trim().length > 0 || b.images.length > 0, { message: "Describe the site or add a photo" });

/**
 * Site intake (D-021): description and/or photos -> where to start and what to look for, as SUGGESTIONS.
 * The checklist and the site situation come from stored facts on the server, so the phone can't feed the model invented
 * items, and only real checklist ids can come back. Nothing here changes the job: the person (or their chosen automatic
 * mode, on the phone) applies what they want through the normal checklist route. Photos are not stored by this route.
 */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const limited = await aiGuard(auth, "site-intake", 6);
  if (limited) return limited;
  try {
    const body = Body.parse(await req.json());
    const facts = await loadAssessmentFacts(auth.ctx, body.assessmentId);
    const checklist = facts.items.map((it) => ({ id: it.id, title: it.title, lookFor: it.instructions }));
    const result = await siteIntake(
      { mode: facts.assessment.mode, pack: facts.assessment.pack, scenario: facts.scenario, description: body.description, images: body.images, checklist },
      { onRun: aiRunHook(auth, body.assessmentId) },
    );
    return NextResponse.json({ ...result, evidenceIds: onlyKnownRefs(body.evidenceIds, facts.evidenceIds), label: "AI suggestion — needs your review" });
  } catch (e) {
    return aiError(e);
  }
}
