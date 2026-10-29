import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeImage } from "@eval-ai/ai-adapter";
import { requireAuth } from "../../../../lib/auth";

const Schema = z.object({ imageBase64: z.string().min(1).max(14_000_000), mimeType: z.string().default("image/jpeg"), assessmentId: z.string().optional(), prompt: z.string().optional() });

export async function POST(req: Request) {
  const { error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const body = Schema.parse(await req.json());
    const hasKey = !!process.env.AI_PROVIDER_API_KEY;
    if (!hasKey) return NextResponse.json({ error: "AI_PROVIDER_API_KEY not set — photo analysis unavailable", limitations: ["Image analysis requires a configured Meta image-input model"], uncertainty: "high", requiresHumanReview: true }, { status: 503 });

    // Live path — Spark with image_url input, verified against the live Meta API with synthetic data.
    // The result is always a suggestion: never a verified measurement or hidden-condition claim.
    const result = await analyzeImage({ imageBase64: body.imageBase64, mimeType: body.mimeType, prompt: body.prompt });
    const isFallback = result.summary.startsWith("Fallback suggestion");
    return NextResponse.json({ ...result, fallback: isFallback, mimeType: body.mimeType });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
