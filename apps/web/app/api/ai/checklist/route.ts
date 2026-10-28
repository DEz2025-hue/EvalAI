import { NextResponse } from "next/server";
import { sparkProposeChecklist } from "@eval-ai/ai-adapter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await sparkProposeChecklist(body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Missing AI_PROVIDER")) return NextResponse.json({ error: msg }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
