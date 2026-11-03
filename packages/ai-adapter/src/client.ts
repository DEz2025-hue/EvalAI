import type { AdapterConfig } from "./config";
import type { Usage } from "./pricing";

// Server-only HTTP client for the Meta Model API.
// Retry rules follow https://dev.meta.ai/docs/error-handling: retry 429/500/503 (≤3, honour Retry-After, jittered
// exponential backoff); never retry 400/401/402/403/404/413 or 504 — a retried timeout is billed twice and usually times out again.

export type AiErrorCode =
  | "auth"
  | "billing"
  | "forbidden"
  | "model_not_found"
  | "bad_request"
  | "content_policy"
  | "payload_too_large"
  | "rate_limit"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "not_configured"
  | "unsupported_audio";

export class AiAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: AiErrorCode,
    public readonly status?: number,
    /** The provider's own error code, e.g. "billing_not_configured". */
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = "AiAdapterError";
  }
}

/** Never log or surface raw keys, audio, images or full prompts. */
export function redact(text: string): string {
  return String(text).replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_API_KEY]").replace(/Bearer\s+[A-Za-z0-9._-]{10,}/g, "Bearer [REDACTED]").slice(0, 500);
}

export type RequestOptions = {
  timeoutMs?: number;
  /** Retries after the first attempt (default 3). */
  maxRetries?: number;
  /** Test hook / backoff tuning. */
  sleep?: (ms: number) => Promise<void>;
  baseBackoffMs?: number;
  /** A Retry-After longer than this fails fast instead of holding a serverless function open. */
  maxRetryWaitMs?: number;
};

export type MetaResponse = { status: number; data: unknown; headers: Headers; latencyMs: number };

const RETRYABLE = new Set([429, 500, 503]);

function classify(status: number, body: unknown): AiAdapterError {
  const err = ((body as { error?: { code?: string; message?: string; type?: string } } | null)?.error ?? {}) as { code?: string; message?: string; type?: string };
  const providerCode = err.code;
  const detail = err.message ? redact(err.message) : "";
  switch (status) {
    case 400:
      if (providerCode === "content_policy_violation") return new AiAdapterError("The AI service declined this content", "content_policy", 400, providerCode);
      return new AiAdapterError("The AI request was invalid" + (detail ? ": " + detail : ""), "bad_request", 400, providerCode);
    case 401:
      return new AiAdapterError("AI provider rejected the API key", "auth", 401, providerCode);
    case 402:
      return new AiAdapterError("AI provider billing is not set up for this account", "billing", 402, providerCode);
    case 403:
      return new AiAdapterError("This API key has no access to that model or feature", "forbidden", 403, providerCode);
    case 404:
      return new AiAdapterError("AI model or endpoint not found — check the configured model id", "model_not_found", 404, providerCode);
    case 413:
      return new AiAdapterError("The AI request was too large", "payload_too_large", 413, providerCode);
    case 429:
      return new AiAdapterError("AI provider rate limit reached", "rate_limit", 429, providerCode);
    case 504:
      return new AiAdapterError("The AI service timed out", "timeout", 504, providerCode);
    default:
      return new AiAdapterError(`AI provider error (${status})` + (detail ? ": " + detail : ""), "provider_error", status, providerCode);
  }
}

export async function metaRequest(
  cfg: Pick<AdapterConfig, "baseUrl" | "apiKey">,
  path: string,
  init: { method?: "GET" | "POST"; json?: unknown; form?: FormData; accept?: string },
  opts: RequestOptions = {},
): Promise<MetaResponse> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const baseBackoff = opts.baseBackoffMs ?? 600;
  const maxRetryWait = opts.maxRetryWaitMs ?? 20_000;
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/v1${path}`;

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = Date.now();
    let res: Response;
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}` };
      if (init.json !== undefined) headers["Content-Type"] = "application/json";
      if (init.accept) headers.Accept = init.accept;
      res = await fetch(url, {
        method: init.method ?? "POST",
        headers,
        body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).name === "AbortError") throw new AiAdapterError(`AI request timed out after ${timeoutMs}ms`, "timeout");
      // The request never reached the provider (DNS/connection) — safe to retry, nothing was billed.
      if (attempt < Math.min(maxRetries, 2)) {
        await sleep(baseBackoff * 2 ** attempt + Math.random() * 400);
        continue;
      }
      throw new AiAdapterError(`AI request failed: ${redact((e as Error).message)}`, "provider_error");
    }
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    const text = await res.text().catch(() => "");
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (e.g. text/plain) is returned as text */
    }

    if (res.ok) return { status: res.status, data, headers: res.headers, latencyMs };

    if (RETRYABLE.has(res.status) && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseBackoff * 2 ** attempt + Math.random() * 1000;
      if (waitMs > maxRetryWait) throw classify(res.status, data);
      await sleep(waitMs);
      continue;
    }
    throw classify(res.status, data);
  }
}

/** Normalise usage from Chat Completions or Responses shapes. Reasoning tokens are billed as output. */
export function normalizeUsage(raw: unknown): Usage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const prompt = n(u.prompt_tokens ?? u.input_tokens);
  const completion = n(u.completion_tokens ?? u.output_tokens);
  const details = (u.completion_tokens_details ?? u.output_tokens_details ?? {}) as Record<string, unknown>;
  return { promptTokens: prompt, completionTokens: completion, reasoningTokens: n(details.reasoning_tokens), totalTokens: n(u.total_tokens) || prompt + completion };
}

// Simple in-memory limiter (per server instance). A shared limiter (Redis/DB) is a later hardening step.
const rateBuckets = new Map<string, number[]>();
export function checkRateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const fresh = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (fresh.length >= limit) return false;
  fresh.push(now);
  rateBuckets.set(key, fresh);
  return true;
}
