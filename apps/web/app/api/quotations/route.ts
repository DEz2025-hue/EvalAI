import { NextResponse } from "next/server";
import { z } from "zod";

const Item = z.object({ description: z.string().min(2), quantity: z.number().positive(), unit: z.string().min(1), unitPrice: z.number().nonnegative(), currency: z.string().length(3), taxesOrFees: z.number().optional() });
const Body = z.object({
  assessmentId: z.string(),
  materialsVersion: z.number().int().positive(),
  supplier: z.string().min(1),
  currency: z.string().length(3),
  items: z.array(Item).min(1),
  date: z.string().optional(),
  reference: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const { saveQuotationLocal } = await import("../../../lib/store");
    const result = await saveQuotationLocal({ assessmentId: body.assessmentId, workspaceId: (body as unknown as { workspaceId?: string }).workspaceId, materialsVersion: body.materialsVersion, supplier: body.supplier, currency: body.currency, items: body.items, date: body.date, reference: body.reference });
    return NextResponse.json({ ok: true, ...body, total: result.total, id: result.id, stale: false, reviewStatus: "pending", persisted: result.persisted, note: result.persisted ? "Quotation provenance stored to Supabase" : "Quotation provenance stored to deterministic file fallback — no fabricated price" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  const { getQuotationsLocal } = await import("../../../lib/store");
  const items = await getQuotationsLocal(id);
  return NextResponse.json({ assessmentId: id, items, count: items.length });
}
