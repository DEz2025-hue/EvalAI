import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAccount, planAccountDeletion } from "../account";

type Member = { workspace_id: string; user_id: string; role: string };
const ME = "u-me";

/** Minimal stand-in for the service-role client: memberships plus spies for the destructive calls. */
function fakeAdmin(members: Member[], names: Record<string, string>) {
  const deleteWorkspaces = vi.fn(async () => ({ error: null }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const from = (table: string) => ({
    select: () => ({
      eq: async (_col: string, userId: string) => ({
        data: members.filter((m) => m.user_id === userId).map((m) => ({ ...m, workspaces: { name: names[m.workspace_id] } })),
        error: null,
      }),
      in: async (_col: string, ids: string[]) => {
        if (table === "workspace_memberships") return { data: members.filter((m) => ids.includes(m.workspace_id)), error: null };
        if (table === "evidence_items") return { data: [{ storage_key: "evidence/a1/x.jpg" }], error: null };
        if (table === "report_snapshots") return { data: [{ id: "s1" }], error: null };
        return { data: [], error: null };
      },
    }),
    delete: () => ({ in: deleteWorkspaces }),
  });
  const admin = { from, auth: { admin: { deleteUser } }, storage: { from: () => ({ remove }) } } as unknown as SupabaseClient;
  return { admin, deleteWorkspaces, deleteUser, remove };
}

describe("planAccountDeletion", () => {
  it("deletes solo workspaces, blocks sole-owner shared ones, and leaves the rest", async () => {
    const { admin } = fakeAdmin(
      [
        { workspace_id: "solo", user_id: ME, role: "owner" },
        { workspace_id: "team", user_id: ME, role: "owner" },
        { workspace_id: "team", user_id: "u-2", role: "member" },
        { workspace_id: "co", user_id: ME, role: "owner" },
        { workspace_id: "co", user_id: "u-3", role: "owner" },
        { workspace_id: "joined", user_id: ME, role: "member" },
        { workspace_id: "joined", user_id: "u-4", role: "owner" },
      ],
      { solo: "Mine", team: "Team", co: "Co-owned", joined: "Joined" },
    );
    const plan = await planAccountDeletion(admin, ME);
    expect(plan.deleteWorkspaces.map((w) => w.id)).toEqual(["solo"]);
    expect(plan.blockers.map((w) => w.id)).toEqual(["team"]);
    expect(plan.leaveWorkspaces.map((w) => w.id).sort()).toEqual(["co", "joined"]);
  });
});

describe("deleteAccount", () => {
  it("refuses and touches nothing while a workspace blocks", async () => {
    const f = fakeAdmin(
      [
        { workspace_id: "team", user_id: ME, role: "owner" },
        { workspace_id: "team", user_id: "u-2", role: "admin" },
      ],
      { team: "Team" },
    );
    const res = await deleteAccount(f.admin, ME);
    expect(res.deleted).toBe(false);
    expect(f.deleteWorkspaces).not.toHaveBeenCalled();
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes solo workspaces, then the user, then their files", async () => {
    const f = fakeAdmin([{ workspace_id: "solo", user_id: ME, role: "owner" }], { solo: "Mine" });
    const res = await deleteAccount(f.admin, ME);
    expect(res.deleted).toBe(true);
    expect(f.deleteWorkspaces).toHaveBeenCalledWith("id", ["solo"]);
    expect(f.deleteUser).toHaveBeenCalledWith(ME);
    expect(f.remove).toHaveBeenCalledWith(["evidence/a1/x.jpg"]);
    expect(f.remove).toHaveBeenCalledWith(["reports/s1.pdf"]);
    expect(f.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(f.remove.mock.invocationCallOrder[0]);
  });
});
