import { NextResponse } from "next/server";
import { z } from "zod";
import { reapplyReportTemplateLocal } from "../../../../lib/store";
import { requireWriter, storeError } from "../../../../lib/auth";

const Body = z.object({ snapshotId: z.string().min(3).max(100) });

/** Puts the office's current report style into a DRAFT. A finalized report is never changed. */
export async function POST(req: Request) {
  const { auth, error: authErr } = await requireWriter();
  if (authErr) return authErr;
  try {
    const { snapshotId } = Body.parse(await req.json());
    const snapshot = await reapplyReportTemplateLocal(snapshotId, auth.ctx);
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return storeError(e);
  }
}
