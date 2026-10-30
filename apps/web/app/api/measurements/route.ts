import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireWriter, storeError } from "../../../lib/auth";
import { saveMeasurementLocal, listMeasurementsLocal, deleteMeasurementLocal, verifyAssessmentWorkspace } from "../../../lib/store";

const Input = z.object({ value: z.number().finite(), unit: z.enum(["m", "cm", "mm", "ft", "in", "ratio"]) });

const Body = z.object({
  assessmentId: z.string().min(1).max(100),
  itemId: z.string().max(100).nullish(),
  name: z.string().trim().min(1).max(200),
  formula: z.enum(["area", "volume", "cable_with_sag", "manual"]),
  inputs: z.record(Input).optional(),
  value: z.number().finite().optional(),
  unit: z.string().trim().max(20).optional(),
  note: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const id = new URL(req.url).searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  try {
    await verifyAssessmentWorkspace(auth.ctx, id);
    const measurements = await listMeasurementsLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, measurements, count: measurements.length });
  } catch (e) {
    return storeError(e);
  }
}

/** The result is computed on the server from the inputs; a client-supplied result is never trusted. */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    const measurement = await saveMeasurementLocal({ assessmentId: body.assessmentId, itemId: body.itemId ?? null, name: body.name, formula: body.formula, inputs: body.inputs as Record<string, { value: number; unit: "m" | "cm" | "mm" | "ft" | "in" | "ratio" }> | undefined, value: body.value, unit: body.unit, note: body.note, ctx: auth.ctx });
    return NextResponse.json({ ok: true, measurement });
  } catch (e) {
    return storeError(e);
  }
}

export async function DELETE(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const assessmentId = url.searchParams.get("assessmentId");
  const id = url.searchParams.get("id");
  if (!assessmentId || !id) return NextResponse.json({ error: "assessmentId and id required" }, { status: 400 });
  try {
    await deleteMeasurementLocal(assessmentId, id, auth.ctx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return storeError(e);
  }
}
