import { NextResponse } from "next/server";
import { CreateAssessmentSchema } from "../../../lib/validations";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { createAssessmentLocal, listAssessmentsLocal } from "../../../lib/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CreateAssessmentSchema.parse(body);
    const tpl = PACK_TEMPLATES[parsed.pack];
    if (!tpl) return NextResponse.json({ error: "Unknown pack" }, { status: 400 });

    const { id, persisted } = await createAssessmentLocal({
      workspaceId: body.workspaceId as string | undefined,
      siteName: parsed.siteName,
      address: parsed.address,
      mode: parsed.mode,
      pack: parsed.pack,
      goal: parsed.goal,
      existingEquipment: parsed.existingEquipment,
    });
    const checklist = tpl.checklist.map((title, i) => ({ id: `${id}_item_${i}`, title, required: i < 5 }));
    return NextResponse.json({ id, ...parsed, checklist, status: "draft", persisted, note: persisted ? "Persisted to Supabase + file fallback" : "Persisted to deterministic file fallback (.tmp-data) — set Supabase env for RLS" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const items = await listAssessmentsLocal(workspaceId);
  return NextResponse.json({ items, persisted: true, count: items.length });
}
