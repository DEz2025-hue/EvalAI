import { NextResponse } from "next/server";
import { requireAuth, storeError } from "../../../lib/auth";
import { getCompletenessLocal } from "../../../lib/store";

/** Completeness review for a job: blockers prevent finalize, warnings are advisory. */
export async function GET(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  const id = new URL(req.url).searchParams.get("assessmentId");
  if (!id) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  try {
    const result = await getCompletenessLocal(id, auth.ctx);
    return NextResponse.json({ assessmentId: id, ...result });
  } catch (e) {
    return storeError(e);
  }
}
