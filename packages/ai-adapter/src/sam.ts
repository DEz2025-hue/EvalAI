import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError, metaRequest } from "./client";
import { reportRun, type CallOptions } from "./chat";
import { estimateSamImageCostUsd } from "./pricing";

// SAM 3.1 — POST /v1/responses with one input_text (a single noun phrase) and one input_image.
// https://dev.meta.ai/docs/sam/segmenting
// Masks and boxes are NOT measurements. The text-record output format has not been verified against a live response yet,
// so the raw records are returned and nothing is parsed into counts or dimensions.

export const SamSegmentInput = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  /** One short noun phrase, e.g. "solar panel". Lists, questions and negations are unreliable. */
  prompt: z.string().min(2).max(60),
});

export async function samSegment(input: z.infer<typeof SamSegmentInput>, options?: CallOptions) {
  const v = SamSegmentInput.parse(input);
  const cfg = getAdapterConfig();
  const oc = cfg.ops.segment;
  const t0 = Date.now();
  try {
    const res = await metaRequest(
      cfg,
      "/responses",
      { json: { model: oc.model, input: [{ role: "user", content: [{ type: "input_text", text: v.prompt }, { type: "input_image", image_url: "data:" + v.mimeType + ";base64," + v.imageBase64 }] }], metadata: { include_confidence: "true" } } },
      { timeoutMs: oc.timeoutMs, ...options?.request },
    );
    await reportRun(options?.onRun, { operation: "segment", model: oc.model, status: "ok", latencyMs: Date.now() - t0, estimatedCostUsd: estimateSamImageCostUsd() });
    const d = res.data as { output?: Array<{ content?: Array<{ text?: string }> }>; output_text?: string } | null;
    const text = d?.output_text ?? d?.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
    return { rawRecords: text.slice(0, 20000), limitations: ["Segmentation is not a verified measurement — human review required"], requiresHumanReview: true as const };
  } catch (e) {
    await reportRun(options?.onRun, { operation: "segment", model: oc.model, status: "error", errorCode: e instanceof AiAdapterError ? e.code : "unknown", latencyMs: Date.now() - t0 });
    throw e;
  }
}
