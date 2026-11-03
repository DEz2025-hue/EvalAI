import { NextResponse } from "next/server";
import { AiAdapterError, checkRateLimit, getAdapterConfig, type RunHook } from "@eval-ai/ai-adapter";
import { scenarioFor } from "@eval-ai/shared";
import { dailyCapUsd, recordAiRun, spendTodayUsd } from "./aiUsage";
import { getAssessmentLocal, getChecklistItemsLocal, getResponsesLocal, listEvidenceLocal, verifyAssessmentWorkspace, type StoreCtx } from "./store";
import type { RequestAuth } from "./auth";

type Authed = Extract<RequestAuth, { mode: "demo" } | { mode: "authenticated" }>;

/** Verified workspace key for rate limiting: never the client-supplied value when signed in. */
export function aiWorkspaceKey(auth: Authed): string {
  return auth.mode === "authenticated" ? (auth.ctx.workspaceId as string) : "demo";
}

/**
 * Guard in front of every provider call: per-workspace rate limit plus an optional daily spend cap
 * (AI_DAILY_COST_CAP_USD, estimated from the ai_runs log). Returns a ready response when the call must not proceed.
 */
export async function aiGuard(auth: Authed, op: string, limit = 20): Promise<NextResponse | null> {
  if (!checkRateLimit(op + ":" + aiWorkspaceKey(auth), limit)) {
    return NextResponse.json({ error: "Too many AI requests — wait a minute and try again." }, { status: 429 });
  }
  const cap = dailyCapUsd();
  if (cap && auth.mode === "authenticated" && (await spendTodayUsd(auth.ctx.workspaceId)) >= cap) {
    return NextResponse.json({ error: "This workspace reached its daily AI limit. You can continue manually, and the limit resets tomorrow." }, { status: 429 });
  }
  return null;
}

/** Usage hook handed to the adapter: records each provider call (metadata only) against the workspace. */
export function aiRunHook(auth: Authed, assessmentId?: string): RunHook | undefined {
  if (auth.mode !== "authenticated") return undefined;
  const ctx = { workspaceId: auth.ctx.workspaceId, userId: auth.ctx.userId, assessmentId };
  return (run) => recordAiRun(ctx, run);
}

/**
 * Server-side facts for an assessment. AI payloads are assembled here from stored data so a client
 * can never feed the model fabricated checklist state, evidence ids or workspace ids.
 */
export async function loadAssessmentFacts(ctx: StoreCtx, assessmentId: string) {
  await verifyAssessmentWorkspace(ctx, assessmentId);
  const assessment = await getAssessmentLocal(assessmentId, ctx);
  if (!assessment) throw new Error("Assessment not found");
  const [items, responses, evidence] = await Promise.all([
    getChecklistItemsLocal(assessmentId, ctx),
    getResponsesLocal(assessmentId, ctx),
    listEvidenceLocal(assessmentId, ctx),
  ]);
  // New installation or existing system, decided from the stored job and never from the client. Undefined = not set.
  const scenario = scenarioFor(assessment.mode, assessment.context.scenario) ?? undefined;
  return { assessment, items, responses, evidenceIds: evidence.items.map((e) => e.id), scenario };
}

/** Safe AI error mapping: no provider internals are returned to the browser. */
export function aiError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof AiAdapterError) return adapterErrorResponse(e);
  if (e instanceof Error && e.name === "ZodError") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (e instanceof Error && (e.name === "DbFailure" || e.name === "DbConflict")) return NextResponse.json({ error: "Database operation failed — please retry" }, { status: 500 });
  if (msg.startsWith("Forbidden")) return NextResponse.json({ error: msg }, { status: 403 });
  if (/not found/i.test(msg)) return NextResponse.json({ error: msg }, { status: 404 });
  if (msg.includes("Missing AI_PROVIDER")) return NextResponse.json({ error: "AI assistance is not configured on this server. You can continue manually." }, { status: 503 });
  if (/rate limit/i.test(msg)) return NextResponse.json({ error: "Too many AI requests — wait a minute and try again." }, { status: 429 });
  if (/timed out|timeout/i.test(msg)) return NextResponse.json({ error: "The AI service took too long. You can continue manually or try again." }, { status: 504 });
  console.error("AI route error:", msg);
  return NextResponse.json({ error: "The AI service is unavailable. You can continue manually." }, { status: 502 });
}

/** Keep only ids that point at real evidence for this assessment (drops fabricated refs). */
export function onlyKnownRefs(refs: string[] | undefined, known: string[]): string[] {
  const set = new Set(known);
  return (refs ?? []).filter((r) => set.has(r));
}

/** The provider the server is set up to use, for error messages. null when no provider is configured. */
function activeProvider(): "OpenRouter" | "Meta" | null {
  try {
    return getAdapterConfig().provider === "openrouter" ? "OpenRouter" : "Meta";
  } catch {
    return null;
  }
}

/** Map provider failures to safe, actionable responses. The provider's own message and codes are logged, never returned. */
export function adapterErrorResponse(e: AiAdapterError): NextResponse {
  // For an unusable answer, our own message says which case it was (cut off, empty, not valid JSON). It holds no prompt, image or key text.
  console.error("AI provider error:", e.code, e.status ?? "", e.providerCode ?? "", e.code === "invalid_response" ? e.message.slice(0, 120) : "");
  const manual = " You can continue manually.";
  const who = activeProvider();
  switch (e.code) {
    case "billing":
      // Say which provider is asking for money: the two have different places to fix it, and the person may have paid the other one.
      if (who === "OpenRouter") {
        // OpenRouter named how little the key can still pay for. Usually the account has no purchased credit (a key's spending limit is a
        // cap, not a balance); it can also be the key's own limit.
        const text = e.affordableTokens !== undefined
          ? "The OpenRouter account has almost no credit left, so answers get cut short. Add credit at openrouter.ai (and check the key's spending limit), then try again."
          : "AI assistance is not available yet: the OpenRouter account has no credit. Add credit at openrouter.ai, then try again.";
        return NextResponse.json({ error: text + manual, code: "ai_billing" }, { status: 503 });
      }
      if (who === "Meta") {
        return NextResponse.json({ error: "AI assistance is not available yet: Meta billing is not set up for the team that owns this API key. Complete billing in the Meta developer dashboard." + manual, code: "ai_billing" }, { status: 503 });
      }
      return NextResponse.json({ error: "AI assistance is not available yet: the AI provider account needs billing set up." + manual, code: "ai_billing" }, { status: 503 });
    case "auth":
    case "forbidden":
    case "model_not_found":
    case "not_configured":
      return NextResponse.json({ error: "AI assistance is not configured correctly on the server (provider key or model)." + (who ? ` Provider in use: ${who}.` : "") + manual, code: "ai_config" }, { status: 503 });
    case "rate_limit":
      return NextResponse.json({ error: "The AI service is busy — wait a moment and try again." }, { status: 429 });
    case "timeout":
      return NextResponse.json({ error: "The AI service took too long." + manual }, { status: 504 });
    case "content_policy":
      return NextResponse.json({ error: "The AI service declined this content." }, { status: 422 });
    case "unsupported_audio":
      return NextResponse.json({ error: e.message }, { status: 400 });
    case "invalid_response":
      // "No speech was detected" is useful to the person; other malformed output is not.
      if (/^No speech/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 422 });
      // The model used up its room before finishing (even after one retry with less reasoning). Fewer photos or items help.
      if (/^The AI answer was cut off/.test(e.message)) return NextResponse.json({ error: "The AI ran out of room before finishing. Try again, or use fewer photos." }, { status: 502 });
      return NextResponse.json({ error: "The AI returned an unusable answer. Try again or continue manually." }, { status: 502 });
    default:
      return NextResponse.json({ error: "The AI service is unavailable." + manual }, { status: 502 });
  }
}
