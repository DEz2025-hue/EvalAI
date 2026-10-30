import type { AdapterConfig, Operation, ReasoningEffort } from "./config";
import { AiAdapterError, metaRequest, normalizeUsage, redact, type RequestOptions } from "./client";
import { estimateTokenCostUsd, type Usage } from "./pricing";

// One call to /v1/chat/completions with schema-constrained JSON output.
// Meta guarantees decoding matches the schema (https://dev.meta.ai/docs/structured-output), so there is no
// "repair" logic here — a response that is still unusable is surfaced as an error instead of being papered over.

export type JsonSchema = Record<string, unknown>;

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type AiRunRecord = {
  operation: Operation;
  model: string;
  effort?: ReasoningEffort;
  status: "ok" | "error";
  errorCode?: string;
  latencyMs: number;
  usage?: Usage;
  estimatedCostUsd?: number | null;
  audioDurationMs?: number;
};

/** Called once per provider call (success or failure) so the host app can persist usage without the adapter touching a database. */
export type RunHook = (run: AiRunRecord) => void | Promise<void>;
export type CallOptions = { onRun?: RunHook; request?: RequestOptions };

export async function reportRun(hook: RunHook | undefined, run: AiRunRecord): Promise<void> {
  // Metadata only — never prompts, audio or images.
  console.log(JSON.stringify({ type: "ai_run", operation: run.operation, model: run.model, status: run.status, errorCode: run.errorCode, latencyMs: run.latencyMs, tokens: run.usage?.totalTokens, reasoningTokens: run.usage?.reasoningTokens }));
  if (!hook) return;
  try {
    await hook(run);
  } catch (e) {
    console.error("AI run hook failed:", redact(e instanceof Error ? e.message : String(e)));
  }
}

export async function chatJson(
  cfg: AdapterConfig,
  op: Operation,
  args: { system: string; user: string | ContentPart[]; schemaName: string; schema: JsonSchema },
  options: CallOptions = {},
): Promise<{ data: unknown; usage: Usage; model: string }> {
  const oc = cfg.ops[op];
  const body: Record<string, unknown> = {
    model: oc.model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: args.schemaName, schema: args.schema } },
  };
  // Meta: Muse Spark is tuned for default sampling — no temperature/top_p here. Reasoning tokens count toward the limit.
  if (oc.reasoningEffort) body.reasoning_effort = oc.reasoningEffort;
  if (oc.maxCompletionTokens) body.max_completion_tokens = oc.maxCompletionTokens;

  const t0 = Date.now();
  try {
    const res = await metaRequest(cfg, "/chat/completions", { json: body }, { timeoutMs: oc.timeoutMs, ...options.request });
    const d = res.data as { choices?: Array<{ message?: { content?: unknown; refusal?: string }; finish_reason?: string }>; usage?: unknown } | null;
    const choice = d?.choices?.[0];
    const usage = normalizeUsage(d?.usage);
    if (choice?.finish_reason === "length") {
      throw new AiAdapterError("The AI answer was cut off (token limit reached) — raise the limit or lower the reasoning effort", "invalid_response");
    }
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new AiAdapterError("The AI returned an empty answer", "invalid_response");
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new AiAdapterError("The AI returned an answer that is not valid JSON", "invalid_response");
    }
    await reportRun(options.onRun, { operation: op, model: oc.model, effort: oc.reasoningEffort, status: "ok", latencyMs: Date.now() - t0, usage, estimatedCostUsd: estimateTokenCostUsd(oc.model, usage) });
    return { data, usage, model: oc.model };
  } catch (e) {
    await reportRun(options.onRun, { operation: op, model: oc.model, effort: oc.reasoningEffort, status: "error", errorCode: e instanceof AiAdapterError ? e.code : "unknown", latencyMs: Date.now() - t0 });
    throw e;
  }
}
