import { AnalyzeImageInput, AnalyzeImageOutput } from "./schemas";
import { metaFetch, AiAdapterError } from "./client";
import { getAdapterConfig } from "./config";

export async function analyzeImage(input: unknown) {
  const cfg = getAdapterConfig();
  const validated = AnalyzeImageInput.parse(input);
  const t0 = Date.now();
  try {
    // Chat-based photo analysis uses Spark (verified live with image_url input).
    // SAM 3.1 is segmentation-only via /v1/responses and stays a separate optional op (samSegment) — never the chat model here.
    const raw = await metaFetch(cfg, "/v1/chat/completions", {
      model: cfg.sparkModel,
      messages: [
        {
          role: "system",
          content:
            "You are EvalAI photo analysis. Never invent measurements, hidden conditions, compliance results, or prices. Output JSON only: summary, observations[], limitations[], uncertainty (low|medium|high), requiresHumanReview=true.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: JSON.stringify({ task: "analyzeImage", prompt: validated.prompt, assessmentContext: validated.assessmentContext }) },
            { type: "image_url", image_url: { url: `data:${validated.mimeType};base64,${validated.imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
    const rec = raw as { choices?: Array<{ message?: { content?: string } }> };
    const content = rec.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : raw;
    return AnalyzeImageOutput.parse({
      summary: (parsed as { summary?: string }).summary ?? "Photo suggestion — human review required",
      observations: (parsed as { observations?: string[] }).observations ?? [],
      limitations: [
        ...((parsed as { limitations?: string[] }).limitations ?? []),
        "Photo analysis is not a verified measurement",
      ],
      uncertainty: (parsed as { uncertainty?: "low" | "medium" | "high" }).uncertainty ?? "high",
      requiresHumanReview: true,
    });
  } catch (e) {
    void t0;
    if (e instanceof AiAdapterError && e.code === "not_configured") throw e;
    return AnalyzeImageOutput.parse({
      summary: "Fallback suggestion — live image model not verified. Review the original photo; do not treat visual estimates as facts.",
      observations: [],
      limitations: [
        "Provider image-input not verified in this environment",
        e instanceof Error ? e.message : String(e),
        "AI cannot see hidden wiring, infer compliance, or provide verified dimensions from a photo alone",
      ],
      uncertainty: "high",
      requiresHumanReview: true,
    });
  }
}
