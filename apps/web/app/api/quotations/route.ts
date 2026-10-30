import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, workspaceIdFor, storeError, requireWriter } from "../../../lib/auth";
import { verifyAssessmentWorkspace } from "../../../lib/store";

const Currency = z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code, e.g. USD");
const Item = z.object({ description: z.string().min(2).max(500), quantity: z.number().positive().finite(), unit: z.string().min(1).max(30), unitPrice: z.number().nonnegative().finite(), currency: Currency, taxesOrFees: z.number().nonnegative().finite().optional() });
const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  materialsVersion: z.number().int().positive(),
  supplier: z.string().min(1).max(200),
  currency: Currency,
  items: z.array(Item).min(1).max(500),
  date: z.string().optional(),
  reference: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    const { saveQuotationLocal } = await import("../../../lib/store");
    const result = await saveQuotationLocal({ assessmentId: body.assessmentId, workspaceId: workspaceIdFor(auth, (body as unknown as { workspaceId?: string }).workspaceId), materialsVersion: body.materialsVersion, supplier: body.supplier, currency: body.currency, items: body.items as Array<{ description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number }>, date: body.date, reference: body.reference, ctx: auth.ctx });
    return NextResponse.json({ ok: true, ...body, total: result.total, id: result.id, stale: false, reviewStatus: "pending", persisted: result.persisted, note: result.persisted ? "Quotation provenance stored to Supabase" : "Quotation provenance stored to deterministic file fallback — no fabricated price" });
  } catch (e) {
    return storeError(e);
  }
}

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const id = url.searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  try {
    await verifyAssessmentWorkspace(auth.ctx, id);
    const { getQuotationsLocal } = await import("../../../lib/store");
    const items = await getQuotationsLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, items, count: items.length });
  } catch (e) {
    return storeError(e);
  }
}
