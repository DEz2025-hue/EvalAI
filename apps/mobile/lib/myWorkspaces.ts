import { displayName } from "@eval-ai/shared";
import { apiBase, apiFetch } from "./api";
import { getSupabase } from "./supabase";
import { getActiveWorkspace, setActiveWorkspace } from "./workspace";

export type MyWorkspace = { id: string; name: string; role: string };
export type WorkspaceState = { list: MyWorkspace[]; active: MyWorkspace | null; email: string | null; name: string };

type Row = { workspace_id: string; role: string; workspaces: { name: string } | null };

async function readMemberships(userId: string): Promise<MyWorkspace[]> {
  const supabase = getSupabase()!;
  // RLS lets members see every membership row in their workspaces, so filter to the caller's own rows.
  // Ordered like the server's ensureWorkspaceId, so "first" means the same workspace on both sides.
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.workspace_id, name: r.workspaces?.name ?? "Unnamed workspace", role: r.role }));
}

/**
 * The caller's workspaces and the one the app works in.
 * The stored choice is kept only while the caller is still a member; otherwise it falls back to the
 * server's default (oldest membership) and is saved, so direct queries and API calls agree.
 */
export async function loadWorkspaces(): Promise<WorkspaceState> {
  const supabase = getSupabase();
  if (!supabase) return { list: [], active: null, email: null, name: "" };
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { list: [], active: null, email: null, name: "" };

  let list = await readMemberships(user.id);
  if (list.length === 0) {
    // A brand-new account has no workspace yet; the server creates a personal one on first request.
    try {
      apiBase();
      await apiFetch("/api/workspaces");
      list = await readMemberships(user.id);
    } catch {
      /* server unreachable — show the empty state */
    }
  }

  const stored = await getActiveWorkspace();
  const active = list.find((w) => w.id === stored) ?? list[0] ?? null;
  if ((active?.id ?? null) !== stored) await setActiveWorkspace(active?.id ?? null);
  return { list, active, email: user.email ?? null, name: displayName(user) };
}
