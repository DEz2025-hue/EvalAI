import { NextResponse } from "next/server";
import { wonderAnalyzeAssessment } from "@eval-ai/ai-adapter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Enforce workspace authz + validate evidence refs belong to this assessment (see SECURITY.md)
    const result = await wonderAnalyzeAssessment(body);
    // Label drafts clearly — never auto-persist as verified facts
    return NextResponse.json({ ...result, draft: true, label: "AI draft — requires human review" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAuth = msg.includes("Missing AI_PROVIDER");
    return NextResponse.json({ error: msg }, { status: isAuth ? 503 : 500 });
  }
}
