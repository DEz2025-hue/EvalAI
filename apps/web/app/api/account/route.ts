import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "../../../lib/auth";
import { createServiceRoleClient } from "../../../lib/supabase/service";
import { deleteAccount, planAccountDeletion } from "../../../lib/account";

/** What deleting the caller's account would do: workspaces deleted, left, or blocking. */
export async function GET() {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Account deletion is not available right now" }, { status: 503 });
  try {
    return NextResponse.json(await planAccountDeletion(admin, auth.user.id));
  } catch (e) {
    console.error("Account deletion plan failed", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Could not check your account — please retry" }, { status: 500 });
  }
}

const Body = z.object({
  /** The person must type DELETE; guards against accidental or replayed calls. */
  confirm: z.literal("DELETE"),
});

/** Permanently delete the caller's account. 409 with the blocking workspaces when ownership must move first. */
export async function DELETE(req: Request) {
  const { auth, error: authErr } = await requireAuth();
  if (authErr) return authErr;
  if (auth.mode !== "authenticated") return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Account deletion is not available right now" }, { status: 503 });
  try {
    const result = await deleteAccount(admin, auth.user.id);
    if (!result.deleted) {
      const names = result.plan.blockers.map((w) => w.name).join(", ");
      return NextResponse.json({ error: `Make someone else an owner of ${names} first, then try again.`, blockers: result.plan.blockers }, { status: 409 });
    }
    return NextResponse.json({ ok: true, deletedWorkspaces: result.plan.deleteWorkspaces.length });
  } catch (e) {
    console.error("Account deletion failed", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Could not delete your account — please retry" }, { status: 500 });
  }
}
