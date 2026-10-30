import { getAdapterConfig } from "./config";
import { chatJson, type CallOptions } from "./chat";
import { imageSchema } from "./jsonSchemas";
import { SYSTEM_GUARD, compact } from "./text";
import { AnalyzeImageInput, AnalyzeImageOutput } from "./schemas";

// Photo analysis (Muse Spark vision). A SUGGESTION only: never a verified measurement, count or compliance result.

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function analyzeImage(input: unknown, options?: CallOptions) {
  const v = AnalyzeImageInput.parse(input);
  if (!IMAGE_MIMES.has(v.mimeType)) throw new Error("Unsupported image type " + v.mimeType + " — use JPEG, PNG or WebP");
  const cfg = getAdapterConfig();
  const { data } = await chatJson(
    cfg,
    "analyzeImage",
    {
      system:
        SYSTEM_GUARD +
        " Describe what is visible in the photo that matters for a site assessment. Do not state dimensions, quantities, ratings or hidden conditions as facts; photos cannot show wiring behind covers, true sizes or compliance. List what you cannot tell from this photo under limitations.",
      user: [
        { type: "text", text: JSON.stringify({ task: "analyzeImage", prompt: v.prompt ?? "", assessmentContext: compact(v.assessmentContext ?? {}) }) },
        { type: "image_url", image_url: { url: "data:" + v.mimeType + ";base64," + v.imageBase64 } },
      ],
      schemaName: "photo_analysis",
      schema: imageSchema(),
    },
    options,
  );
  const raw = data as { summary?: string; observations?: string[]; limitations?: string[]; uncertainty?: string };
  return AnalyzeImageOutput.parse({
    summary: (raw.summary ?? "").trim() || "No description produced",
    observations: raw.observations ?? [],
    limitations: [...(raw.limitations ?? []), "Photo analysis is a suggestion, not a verified measurement"],
    uncertainty: ["low", "medium", "high"].includes(String(raw.uncertainty)) ? raw.uncertainty : "high",
    requiresHumanReview: true,
  });
}
