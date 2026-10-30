import type { AiRunRecord } from "@eval-ai/ai-adapter";
import { createServiceRoleClient } from "./supabase/service";
import { asUuidOrNull } from "./store";

export type RunContext = { workspaceId?: string; userId?: string; assessmentId?: string };

/** Daily spend limit per workspace in USD (AI_DAILY_COST_CAP_USD). Unset or 0 = no cap. */
export function dailyCapUsd(): number | null {
  const v = Number(process.env.AI_DAILY_COST_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Persist one provider call (metadata only). Best effort: a logging failure must never break the user's request. */
export async function recordAiRun(ctx: RunContext, run: AiRunRecord): Promise<void> {
  const workspaceId = asUuidOrNull(ctx.workspaceId);
  const admin = createServiceRoleClient();
  if (!workspaceId || !admin) return; // demo mode / not configured
  try {
    const { error } = await admin.from("ai_runs").insert({
      workspace_id: workspaceId,
      user_id: asUuidOrNull(ctx.userId),
      assessment_id: asUuidOrNull(ctx.assessmentId),
      operation: run.operation,
      model: run.model,
      effort: run.effort ?? null,
      status: run.status,
      error_code: run.errorCode ?? null,
      latency_ms: Math.max(0, Math.round(run.latencyMs)),
      prompt_tokens: run.usage?.promptTokens ?? null,
      completion_tokens: run.usage?.completionTokens ?? null,
      reasoning_tokens: run.usage?.reasoningTokens ?? null,
      total_tokens: run.usage?.totalTokens ?? null,
      audio_ms: run.audioDurationMs ?? null,
      est_cost_usd: run.estimatedCostUsd ?? null,
    });
    if (error) console.error("ai_runs insert failed:", error.code ?? "", error.message);
  } catch (e) {
    console.error("ai_runs insert failed:", e instanceof Error ? e.message : String(e));
  }
}

/** Estimated spend for today (UTC) in a workspace. Returns 0 when it cannot be read, so a logging problem never blocks work. */
export async function spendTodayUsd(workspaceId: string | undefined): Promise<number> {
  const id = asUuidOrNull(workspaceId);
  const admin = createServiceRoleClient();
  if (!id || !admin) return 0;
  try {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { data, error } = await admin.from("ai_runs").select("est_cost_usd").eq("workspace_id", id).gte("created_at", start.toISOString()).limit(5000);
    if (error) return 0;
    return ((data ?? []) as Array<{ est_cost_usd: number | null }>).reduce((s, r) => s + Number(r.est_cost_usd ?? 0), 0);
  } catch {
    return 0;
  }
}
