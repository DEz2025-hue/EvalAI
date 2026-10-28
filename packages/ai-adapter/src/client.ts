import type { AdapterConfig } from "./index";

// Server-only HTTP client for Meta Model API
// — timeouts, bounded retries, redacted logging, never expose secrets to client

export class AiAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: "auth" | "rate_limit" | "timeout" | "invalid_response" | "provider_error" | "not_configured",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiAdapterError";
  }
}

function redact(text: string): string {
  // Never log raw API keys, audio, images, or full prompts
  return text.replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_API_KEY]").slice(0, 500);
}

export async function metaFetch(
  cfg: AdapterConfig,
  path: string,
  body: unknown,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
  const maxRetries = opts.retries ?? 1; // bounded, idempotent only for safe GETs; POSTs retry only on 429/5xx with backoff
  let lastErr: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
          "X-EvalAI-Operation": path,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (res.status === 429) {
        // rate limited — retry once with backoff if attempts remain
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new AiAdapterError("Rate limited — please retry", "rate_limit", 429);
      }
      if (res.status === 401 || res.status === 403) throw new AiAdapterError("AI provider auth failed — check server env", "auth", res.status);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new AiAdapterError(`Provider error ${res.status}: ${redact(txt)}`, "provider_error", res.status);
      }
      const json = (await res.json()) as unknown;
      return json;
    } catch (e) {
      clearTimeout(t);
      lastErr = e as Error;
      if (e instanceof AiAdapterError) throw e;
      if ((e as Error).name === "AbortError") {
        if (attempt < maxRetries) continue;
        throw new AiAdapterError(`AI request timed out after ${timeoutMs}ms`, "timeout");
      }
      // network error — retry once
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw new AiAdapterError(`AI request failed: ${redact((e as Error).message)}`, "provider_error");
    }
  }
  throw lastErr ?? new AiAdapterError("Unknown AI error", "provider_error");
}

// Choose model per operation: Wonder for complex, Spark for fast, Voice for audio
export function modelFor(op: string, cfg: AdapterConfig): string {
  if (op === "transcribeAudio" || op === "transcribe") return cfg.voiceModel;
  if (op === "analyzeAssessment" || op === "draftFinding" || op === "clarifyContext") return cfg.wonderModel;
  return cfg.sparkModel; // checklist, recommendations, etc — Spark for speed
}
