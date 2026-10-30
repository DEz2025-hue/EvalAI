import { NextResponse } from "next/server";
import { AiAdapterError, checkRateLimit, type RunHook } from "@eval-ai/ai-adapter";
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
  return { assessment, items, responses, evidenceIds: evidence.items.map((e) => e.id) };
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

/** Map provider failures to safe, actionable responses. The provider's own message and codes are logged, never returned. */
export function adapterErrorResponse(e: AiAdapterError): NextResponse {
  console.error("AI provider error:", e.code, e.status ?? "", e.providerCode ?? "");
  const manual = " You can continue manually.";
  switch (e.code) {
    case "billing":
      return NextResponse.json({ error: "AI assistance is not available yet: the AI provider account needs billing set up." + manual, code: "ai_billing" }, { status: 503 });
    case "auth":
    case "forbidden":
    case "model_not_found":
    case "not_configured":
      return NextResponse.json({ error: "AI assistance is not configured correctly on the server (provider key or model)." + manual, code: "ai_config" }, { status: 503 });
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
      return NextResponse.json({ error: "The AI returned an unusable answer. Try again or continue manually." }, { status: 502 });
    default:
      return NextResponse.json({ error: "The AI service is unavailable." + manual }, { status: 502 });
  }
}
