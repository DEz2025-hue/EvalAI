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
    // Never invent prices — only supplied quotation data, with provenance
    const total = body.items.reduce((s, it) => s + it.quantity * it.unitPrice + (it.taxesOrFees ?? 0), 0);
    // TODO: insert into quotations + quotation_items with materials_version tie + RLS
    return NextResponse.json({ ok: true, ...body, total, stale: false, reviewStatus: "pending", note: "Quotation tied to materialsVersion — will be marked stale if materials change" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
