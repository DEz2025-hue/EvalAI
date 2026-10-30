import { NextResponse } from "next/server";
import { checkRateLimit } from "@eval-ai/ai-adapter";
import { getAssessmentLocal, getChecklistItemsLocal, getResponsesLocal, listEvidenceLocal, verifyAssessmentWorkspace, type StoreCtx } from "./store";
import type { RequestAuth } from "./auth";

type Authed = Extract<RequestAuth, { mode: "demo" } | { mode: "authenticated" }>;

/** Verified workspace key for rate limiting: never the client-supplied value when signed in. */
export function aiWorkspaceKey(auth: Authed): string {
  return auth.mode === "authenticated" ? (auth.ctx.workspaceId as string) : "demo";
}

/** Per-workspace, per-operation rate limit. Returns a 429 response when exceeded. */
export function aiRateLimited(auth: Authed, op: string, limit = 20): NextResponse | null {
  if (checkRateLimit(`${op}:${aiWorkspaceKey(auth)}`, limit)) return null;
  return NextResponse.json({ error: "Too many AI requests — wait a minute and try again." }, { status: 429 });
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
