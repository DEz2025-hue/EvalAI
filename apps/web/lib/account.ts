import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account deletion rules:
 *  - a workspace where the person is the only member is deleted with everything in it;
 *  - a shared workspace where they are the only owner blocks deletion until they hand ownership over;
 *  - any other shared workspace keeps its data; their membership goes and their user links become null
 *    ("Deleted user"), via ON DELETE SET NULL from migration 0014.
 * Every query here runs with the service role, so each one is pinned to the caller's user id.
 */

export type WorkspaceSummary = { id: string; name: string; role: string; memberCount: number };
export type DeletionPlan = {
  /** Deleted together with the account (the person is the only member). */
  deleteWorkspaces: WorkspaceSummary[];
  /** Must get another owner before the account can go. */
  blockers: WorkspaceSummary[];
  /** The person simply leaves; the team keeps everything. */
  leaveWorkspaces: WorkspaceSummary[];
};

export async function planAccountDeletion(admin: SupabaseClient, userId: string): Promise<DeletionPlan> {
  const { data: mine, error } = await admin.from("workspace_memberships").select("workspace_id, role, workspaces(name)").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const rows = (mine ?? []) as unknown as Array<{ workspace_id: string; role: string; workspaces: { name: string } | null }>;
  const plan: DeletionPlan = { deleteWorkspaces: [], blockers: [], leaveWorkspaces: [] };
  if (rows.length === 0) return plan;

  const ids = rows.map((r) => r.workspace_id);
  const { data: members, error: memErr } = await admin.from("workspace_memberships").select("workspace_id, user_id, role").in("workspace_id", ids);
  if (memErr) throw new Error(memErr.message);
  const all = (members ?? []) as Array<{ workspace_id: string; user_id: string; role: string }>;

  for (const r of rows) {
    const inWs = all.filter((m) => m.workspace_id === r.workspace_id);
    const ws: WorkspaceSummary = { id: r.workspace_id, name: r.workspaces?.name ?? "Unnamed workspace", role: r.role, memberCount: inWs.length };
    const others = inWs.filter((m) => m.user_id !== userId);
    if (others.length === 0) plan.deleteWorkspaces.push(ws);
    else if (r.role === "owner" && !others.some((m) => m.role === "owner")) plan.blockers.push(ws);
    else plan.leaveWorkspaces.push(ws);
  }
  return plan;
}

async function removeStorage(admin: SupabaseClient, bucket: string, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(keys.slice(i, i + 100));
    if (error) console.error(`Account deletion: could not remove ${bucket} objects`, error.message);
  }
}

/**
 * Deletes the account. Refuses (returns the plan) while there are blockers.
 * Order: collect file keys → delete solo workspaces (rows cascade) → delete the auth user → remove files.
 * Files go last so a failed database step never leaves rows pointing at missing files.
 */
export async function deleteAccount(admin: SupabaseClient, userId: string): Promise<{ deleted: boolean; plan: DeletionPlan }> {
  const plan = await planAccountDeletion(admin, userId);
  if (plan.blockers.length > 0) return { deleted: false, plan };

  const soloIds = plan.deleteWorkspaces.map((w) => w.id);
  let evidenceKeys: string[] = [];
  let reportKeys: string[] = [];
  if (soloIds.length > 0) {
    const { data: ev } = await admin.from("evidence_items").select("storage_key").in("workspace_id", soloIds);
    evidenceKeys = ((ev ?? []) as Array<{ storage_key: string }>).map((e) => e.storage_key);
    const { data: snaps } = await admin.from("report_snapshots").select("id").in("workspace_id", soloIds);
    reportKeys = ((snaps ?? []) as Array<{ id: string }>).map((s) => `reports/${s.id}.pdf`);

    const { error: wsErr } = await admin.from("workspaces").delete().in("id", soloIds);
    if (wsErr) throw new Error("Could not delete your workspaces: " + wsErr.message);
  }

  const { error: userErr } = await admin.auth.admin.deleteUser(userId);
  if (userErr) throw new Error("Could not delete the account: " + userErr.message);

  await removeStorage(admin, "evidence", evidenceKeys);
  await removeStorage(admin, "reports", reportKeys);
  return { deleted: true, plan };
}
