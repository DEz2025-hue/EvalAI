import { NextResponse } from "next/server";
import { scenarioFor } from "@eval-ai/shared";
import { CreateAssessmentSchema } from "../../../lib/validations";
import { requireAuth, workspaceIdFor, storeError, requireWriter } from "../../../lib/auth";
import { createAssessmentLocal, listAssessmentsLocal } from "../../../lib/store";

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const parsed = CreateAssessmentSchema.parse(body);
    const workspaceId = workspaceIdFor(auth, body.workspaceId as string | undefined);
    // An inspection is always about something already installed; an assessment keeps the person's choice (or none).
    const scenario = scenarioFor(parsed.mode, parsed.scenario);

    const { id, persisted, items } = await createAssessmentLocal({
      workspaceId,
      siteName: parsed.siteName,
      address: parsed.address,
      mode: parsed.mode,
      pack: parsed.pack,
      goal: parsed.goal,
      existingEquipment: parsed.existingEquipment,
      scenario,
      ctx: auth.ctx,
    });
    const checklist = items.map((it) => ({ id: it.id, title: it.title, required: it.required }));
    return NextResponse.json({ id, ...parsed, scenario, checklist, status: "draft", persisted, note: persisted ? "Persisted to Supabase + file fallback" : "Persisted to deterministic file fallback (.tmp-data) — set Supabase env for RLS" });
  } catch (e) {
    return storeError(e);
  }
}

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  // Server-verified workspace when authenticated; client value only in demo mode.
  const workspaceId = workspaceIdFor(auth, url.searchParams.get("workspaceId"));
  const items = await listAssessmentsLocal(workspaceId, auth.ctx);
  return NextResponse.json({ items, persisted: true, count: items.length });
}
