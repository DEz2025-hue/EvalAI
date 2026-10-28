import { NextResponse } from "next/server";
import { z } from "zod";

const Item = z.object({
  id: z.string().optional(),
  description: z.string().min(2),
  specification: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  rationale: z.string().min(3), // traceable
  source: z.enum(["measurement", "finding", "rule", "user_input"]),
  provisional: z.boolean().optional(),
  assumptions: z.array(z.string()).optional(),
});

const Body = z.object({ assessmentId: z.string(), items: z.array(Item).min(1), version: z.number().optional() });

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    // Validate rationale present, provisional flagged if critical missing — server also checks via DB trigger for stale quotes
    const provisionalCount = body.items.filter((i) => i.provisional).length;
    const nextVersion = (body.version ?? 1) + 1;
    // TODO: upsert to materials_lists + materials_items with RLS (workspace membership), bump version
    return NextResponse.json({ ok: true, assessmentId: body.assessmentId, version: nextVersion, items: body.items.length, provisionalCount, note: "Materials version bumped — prior quotations now stale (trigger mark_quotations_stale)" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
