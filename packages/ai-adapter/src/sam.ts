import { z } from "zod";
import { getAdapterConfig } from "./config";
import { AiAdapterError, metaRequest } from "./client";
import { reportRun, type CallOptions } from "./chat";
import { estimateSamImageCostUsd } from "./pricing";

// SAM 3.1 — POST /v1/responses with one input_text (a single noun phrase) and one input_image.
// https://dev.meta.ai/docs/sam/segmenting
// Masks and boxes are NOT measurements: they are outlines in pixels. The documented output is a stream of text records,
// e.g. <0f>0<|box;x1=181;y1=365;x2=556;y2=486;w=1516;h=1600;c=0.96|><|mask;...|> (corners inclusive, w/h = source size).
// Only the boxes are parsed. The format comes from the docs; it has NOT been checked against a live response yet
// (the provider account needed billing when this was written), so the parser fails safe: anything unexpected yields no boxes.

export type SamBox = { ordinal: number; x1: number; y1: number; x2: number; y2: number; w: number; h: number; c?: number };

/** Pull the box records (frame 0 only) out of SAM text output. Masks are ignored; malformed records are skipped. */
export function parseSamBoxes(text: string): SamBox[] {
  const out: SamBox[] = [];
  const re = /<(\d+)f>(\d+)<\|box;([^|]*)\|>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== "0") continue;
    const f: Record<string, number> = {};
    for (const part of m[3].split(";")) {
      const [k, v] = part.split("=");
      const n = Number(v);
      if (k && v !== undefined && Number.isFinite(n)) f[k.trim()] = n;
    }
    const { x1, y1, x2, y2, w, h } = f;
    if ([x1, y1, x2, y2, w, h].some((n) => n === undefined)) continue;
    if (!(x2 >= x1 && y2 >= y1 && x1 >= 0 && y1 >= 0 && x2 < w && y2 < h && w > 0 && h > 0)) continue;
    out.push({ ordinal: Number(m[2]), x1, y1, x2, y2, w, h, ...(f.c !== undefined && f.c >= 0 && f.c <= 1 ? { c: f.c } : {}) });
  }
  return out;
}

/** The record text from either a streamed (server-sent events) or a plain JSON response. */
export function extractSamText(data: unknown): string {
  if (typeof data === "string") {
    if (!/^\s*(event|data):/m.test(data)) return data;
    let text = "";
    let completed = "";
    for (const line of data.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as { type?: string; delta?: unknown; response?: { output_text?: unknown } };
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
        else if (ev.type === "response.completed" && typeof ev.response?.output_text === "string") completed = ev.response.output_text;
      } catch {
        /* ignore non-JSON keep-alive lines */
      }
    }
    return text || completed;
  }
  const d = data as { output?: Array<{ content?: Array<{ text?: string }> }>; output_text?: string } | null;
  return d?.output_text ?? d?.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n") ?? "";
}

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
      { json: { model: oc.model, input: [{ role: "user", content: [{ type: "input_text", text: v.prompt }, { type: "input_image", image_url: "data:" + v.mimeType + ";base64," + v.imageBase64 }] }], metadata: { include_confidence: "true" }, stream: true }, accept: "text/event-stream" },
      { timeoutMs: oc.timeoutMs, ...options?.request },
    );
    await reportRun(options?.onRun, { operation: "segment", model: oc.model, status: "ok", latencyMs: Date.now() - t0, estimatedCostUsd: estimateSamImageCostUsd() });
    const text = extractSamText(res.data);
    return { rawRecords: text.slice(0, 20000), boxes: parseSamBoxes(text), limitations: ["Segmentation is not a verified measurement — human review required"], requiresHumanReview: true as const };
  } catch (e) {
    await reportRun(options?.onRun, { operation: "segment", model: oc.model, status: "error", errorCode: e instanceof AiAdapterError ? e.code : "unknown", latencyMs: Date.now() - t0 });
    throw e;
  }
}
