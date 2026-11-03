import { NextResponse } from "next/server";
import { DEFAULT_TEMPLATE, ReportTemplateSchema } from "@eval-ai/shared";
import { getReportTemplateLocal, resetReportTemplateLocal, saveReportTemplateLocal } from "../../../lib/store";
import { isAdmin, requireAuth, storeError } from "../../../lib/auth";

// The office's report style (D-031). Everyone in the workspace can read it; only owners and admins can change it.
// The logo is a small PNG or JPEG sent as a data address, so the request body is limited.
const MAX_BODY = 450_000;

export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  try {
    const template = await getReportTemplateLocal(auth.ctx);
    return NextResponse.json({ template: template ?? DEFAULT_TEMPLATE, isDefault: !template, canEdit: isAdmin(auth) });
  } catch (e) {
    return storeError(e);
  }
}

export async function PUT(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Only an owner or admin can change the report style" }, { status: 403 });
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: "The report style is too large — use a smaller logo" }, { status: 413 });
    const parsed = ReportTemplateSchema.safeParse(JSON.parse(text || "{}"));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report style" }, { status: 400 });
    const saved = await saveReportTemplateLocal(parsed.data, auth.ctx);
    return NextResponse.json({ ok: true, template: saved, note: "Saved. New report drafts use this style; drafts already made keep theirs until you re-apply it, and finalized reports never change." });
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return storeError(e);
  }
}

export async function DELETE() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (!isAdmin(auth)) return NextResponse.json({ error: "Only an owner or admin can change the report style" }, { status: 403 });
  try {
    await resetReportTemplateLocal(auth.ctx);
    return NextResponse.json({ ok: true, template: DEFAULT_TEMPLATE, isDefault: true });
  } catch (e) {
    return storeError(e);
  }
}
