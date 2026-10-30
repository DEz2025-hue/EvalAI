import { NextResponse } from "next/server";
import { sparkProposeChecklist } from "@eval-ai/ai-adapter";
import { requireWriter } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = await req.json();
    if (auth.mode === "authenticated") body.workspaceId = auth.ctx.workspaceId;
    const result = await sparkProposeChecklist(body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Missing AI_PROVIDER")) return NextResponse.json({ error: msg }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
