import { NextResponse } from "next/server";
import { sparkClarifyContext } from "@eval-ai/ai-adapter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // authz: verify workspace membership server-side (TODO: Supabase session)
    const result = await sparkClarifyContext(body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Missing AI_PROVIDER")) return NextResponse.json({ error: msg }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
