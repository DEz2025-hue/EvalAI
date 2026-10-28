import { NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({ imageBase64: z.string().min(1), mimeType: z.string().default("image/jpeg"), assessmentId: z.string().optional(), prompt: z.string().optional() });

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const hasKey = !!process.env.AI_PROVIDER_API_KEY;
    if (!hasKey) return NextResponse.json({ error: "AI_PROVIDER_API_KEY not set — photo analysis pending live verification", limitations: ["Image analysis requires verified Meta image-input model"], uncertainty: "high", requiresHumanReview: true }, { status: 503 });

    // TODO: call samSegment / analyzeImage via Meta adapter with image support verified
    // For now, return structured suggestion with clear limitations — never treat as verified measurement
    return NextResponse.json({
      summary: "Fallback suggestion — real Meta image analysis pending verification. Review original photo; do not treat visual estimates as verified measurements or hidden-condition claims.",
      observations: [],
      limitations: ["AI cannot see hidden wiring, infer compliance, or provide verified dimensions from a photo alone", "Provider image-input not yet verified in this env"],
      uncertainty: "high",
      requiresHumanReview: true,
      fallback: true,
      mimeType: body.mimeType,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
