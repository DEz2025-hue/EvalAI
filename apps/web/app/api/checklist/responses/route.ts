import { NextResponse } from "next/server";
import { z } from "zod";
import { saveResponsesLocal, getResponsesLocal } from "../../../../lib/store";

const Body = z.object({
  assessmentId: z.string(),
  responses: z.array(z.object({
    itemId: z.string(),
    status: z.enum(["pass", "fail", "needs_attention", "not_applicable", "not_checked"]),
    notes: z.string().max(2000).optional(),
    measuredValue: z.number().optional(),
    measuredUnit: z.string().max(20).optional(),
  })),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    // Enforce: Not Checked must stay distinguishable from Pass; never auto-convert — exit gate invariant
    for (const r of body.responses) {
      if (!["pass", "fail", "needs_attention", "not_applicable", "not_checked"].includes(r.status)) throw new Error(`Invalid status ${r.status}`);
    }
    const result = await saveResponsesLocal(body.assessmentId, body.responses);
    return NextResponse.json({ ok: true, assessmentId: body.assessmentId, saved: result.saved, persisted: result.persisted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  const responses = await getResponsesLocal(id);
  return NextResponse.json({ assessmentId: id, responses });
}
