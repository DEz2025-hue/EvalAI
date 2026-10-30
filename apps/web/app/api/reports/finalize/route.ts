import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWriter, storeError } from "../../../../lib/auth";
import { finalizeSnapshotLocal } from "../../../../lib/store";

const Body = z.object({
  snapshotId: z.string().min(1).max(100),
  /** The reviewer must explicitly state they reviewed the report. */
  confirmReviewed: z.literal(true),
  reviewNote: z.string().max(1000).optional(),
});

/** Sign off and finalize a reviewed draft. Records who signed off and when; the result is immutable. */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const body = Body.parse(await req.json());
    const snapshot = await finalizeSnapshotLocal(body.snapshotId, body.reviewNote, auth.ctx);
    return NextResponse.json({ ok: true, snapshot, note: "Finalized and signed off — immutable. Later edits create a new draft." });
  } catch (e) {
    return storeError(e);
  }
}
