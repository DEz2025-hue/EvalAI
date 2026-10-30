import { z } from "zod";
import { getAdapterConfig } from "./config";
import { metaFetch } from "./client";

// SAM 3.1 — visual segmentation, only if it adds value per D-013.
// Keep separate, do not present segmentation as verified measurement.

export const SamSegmentInput = z.object({
  imageBase64: z.string(),
  mimeType: z.string().default("image/jpeg"),
  prompt: z.string().optional(), // e.g. "roof", "panel array"
});

export const SamSegmentOutput = z.object({
  masks: z.array(z.object({ label: z.string(), confidence: z.number().optional(), bbox: z.array(z.number()).optional() })),
  limitations: z.array(z.string()).default(["Segmentation is not a verified measurement — human review required"]),
  requiresHumanReview: z.boolean().default(true),
});

export async function samSegment(input: z.infer<typeof SamSegmentInput>) {
  const cfg = getAdapterConfig();
  const validated = SamSegmentInput.parse(input);
  try {
    const raw = await metaFetch(cfg, "/v1/vision/segment", {
      model: process.env.META_SAM_MODEL || "sam-3.1",
      image: validated.imageBase64,
      mime_type: validated.mimeType,
      prompt: validated.prompt,
    });
    const r = raw as Record<string, unknown>;
    return SamSegmentOutput.parse({
      masks: (r.masks as unknown[]) ?? [],
      limitations: ["SAM segmentation — not a verified dimension"],
      requiresHumanReview: true,
    });
  } catch (e) {
    return { masks: [], limitations: [`SAM unavailable: ${e instanceof Error ? e.message : String(e)}`], requiresHumanReview: true, _fallback: true };
  }
}
