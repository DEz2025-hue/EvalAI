import { NextResponse } from "next/server";
import { wonderAnalyzeAssessment } from "@eval-ai/ai-adapter";
import { requireAuth } from "../../../../lib/auth";

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const body = await req.json();
    // Verified workspace wins for rate-limiting — never trust the client value.
    if (auth.mode === "authenticated") body.workspaceId = auth.ctx.workspaceId;
    const result = await wonderAnalyzeAssessment(body);
    // Label drafts clearly — never auto-persist as verified facts
    return NextResponse.json({ ...result, draft: true, label: "AI draft — requires human review" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAuth = msg.includes("Missing AI_PROVIDER");
    return NextResponse.json({ error: msg }, { status: isAuth ? 503 : 500 });
  }
}
