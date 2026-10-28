import { NextResponse } from "next/server";
import { getAssessmentLocal, getResponsesLocal } from "../../../../lib/store";
import { PACK_TEMPLATES } from "@eval-ai/shared";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const assessment = await getAssessmentLocal(id);
  if (!assessment) return NextResponse.json({ error: "Not found", id }, { status: 404 });
  const responses = await getResponsesLocal(id);
  const tpl = PACK_TEMPLATES[assessment.pack];
  const checklist = tpl.checklist.map((title, i) => ({ id: `${id}_item_${i}`, title, required: i < 5 }));
  return NextResponse.json({ ...assessment, checklist, responses, note: "Fetched from Supabase or deterministic file fallback — RLS when workspaceId present" });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { updateAssessmentContextLocal } = await import("../../../../lib/store");
  const ok = await updateAssessmentContextLocal(id, { siteName: body.siteName, context: body.context });
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
