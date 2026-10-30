import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAssessmentLocal,
  getAssessmentLocal,
  verifyAssessmentWorkspace,
  setMemberRoleLocal,
  removeMemberLocal,
  replaceChecklistItemsLocal,
  saveMaterialsLocal,
  type StoreCtx,
} from "../store";
import { storeError, isWriter, isAdmin } from "../auth";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const TARGET = "44444444-4444-4444-8444-444444444444";
const ASSESSMENT = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };

/** Minimal chainable fake of the Supabase query builder: resolves from `resolve(table, filters, op)`. */
function fakeClient(resolve: (table: string, filters: Row, op: string) => Result, rpc?: (fn: string, args: unknown) => Result): SupabaseClient {
  const builder = (table: string) => {
    const filters: Row = {};
    let op = "select";
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ["select", "insert", "update", "delete", "upsert", "order", "limit", "in"]) {
      b[m] = (...args: unknown[]) => {
        if (["insert", "update", "delete", "upsert"].includes(m)) op = m;
        void args;
        return chain();
      };
    }
    b.eq = (k: string, v: unknown) => {
      filters[k] = v;
      return chain();
    };
    b.single = () => Promise.resolve(resolve(table, filters, op));
    b.maybeSingle = () => Promise.resolve(resolve(table, filters, op));
    b.then = (ok: (r: Result) => unknown) => Promise.resolve(resolve(table, filters, op)).then(ok);
    return b;
  };
  return { from: builder, rpc: (fn: string, args: unknown) => Promise.resolve(rpc ? rpc(fn, args) : { data: null, error: null }) } as unknown as SupabaseClient;
}

const ctxWith = (supabase: SupabaseClient, role = "member"): StoreCtx => ({ supabase, userId: USER, workspaceId: WS, role });

describe("fail-closed workspace checks", () => {
  it("rejects an assessment that RLS hides (not found == foreign)", async () => {
    const ctx = ctxWith(fakeClient(() => ({ data: null, error: null })));
    await expect(verifyAssessmentWorkspace(ctx, ASSESSMENT)).rejects.toThrow(/^Forbidden/);
  });

  it("rejects an assessment from another workspace", async () => {
    const ctx = ctxWith(fakeClient(() => ({ data: { workspace_id: OTHER_WS }, error: null })));
    await expect(verifyAssessmentWorkspace(ctx, ASSESSMENT)).rejects.toThrow(/^Forbidden/);
  });

  it("rejects non-uuid ids for authenticated requests", async () => {
    const ctx = ctxWith(fakeClient(() => ({ data: { workspace_id: WS }, error: null })));
    await expect(verifyAssessmentWorkspace(ctx, "assess_demo_1")).rejects.toThrow(/^Forbidden/);
  });

  it("accepts an assessment in the caller's workspace", async () => {
    const ctx = ctxWith(fakeClient(() => ({ data: { workspace_id: WS }, error: null })));
    await expect(verifyAssessmentWorkspace(ctx, ASSESSMENT)).resolves.toBeUndefined();
  });
});

describe("authenticated requests never fall back to the file store", () => {
  it("getAssessmentLocal returns null (not demo data) when the row is missing", async () => {
    const ctx = ctxWith(fakeClient(() => ({ data: null, error: { code: "PGRST116", message: "no rows" } })));
    await expect(getAssessmentLocal(ASSESSMENT, ctx)).resolves.toBeNull();
  });

  it("createAssessmentLocal surfaces an RLS denial as Forbidden instead of saving to files", async () => {
    const client = fakeClient((table, _f, op) => {
      if (table === "sites" && op === "insert") return { data: { id: "66666666-6666-4666-8666-666666666666" }, error: null };
      return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "assessments"' } };
    });
    await expect(createAssessmentLocal({ siteName: "Site A", mode: "assessment", pack: "solar", ctx: ctxWith(client) })).rejects.toThrow(/^Forbidden/);
  });

  it("raw database errors become a generic DbFailure (no internals leaked)", async () => {
    const client = fakeClient(() => ({ data: null, error: { code: "XX000", message: "relation \"secret_table\" exploded at 10.0.0.5" } }));
    const err = await createAssessmentLocal({ siteName: "Site A", mode: "assessment", pack: "solar", ctx: ctxWith(client) }).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("DbFailure");
    expect((err as Error).message).not.toMatch(/secret_table|10\.0\.0\.5/);
  });

  it("unique-violation becomes a 409-style conflict", async () => {
    const client = fakeClient(() => ({ data: null, error: { code: "23505", message: "duplicate key" } }));
    const err = await createAssessmentLocal({ siteName: "Site A", mode: "assessment", pack: "solar", ctx: ctxWith(client) }).catch((e) => e as Error);
    expect((err as Error).name).toBe("DbConflict");
  });
});

describe("storeError mapping", () => {
  it("maps Forbidden to 403, not found to 404, DbFailure to a generic 500, conflict to 409", async () => {
    expect(storeError(new Error("Forbidden — nope")).status).toBe(403);
    expect(storeError(new Error("Evidence not found")).status).toBe(404);
    const failure = Object.assign(new Error("Database operation failed"), { name: "DbFailure" });
    const res = storeError(failure);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/relation|secret/);
    expect(storeError(Object.assign(new Error("Conflict — x"), { name: "DbConflict" })).status).toBe(409);
  });
});

describe("role helpers", () => {
  it("viewers are not writers; owners/admins/members are; demo mode is allowed", () => {
    const mk = (role?: string) => ({ mode: "authenticated", ctx: { role } }) as never;
    expect(isWriter(mk("viewer"))).toBe(false);
    expect(isWriter(mk(undefined))).toBe(false);
    for (const r of ["owner", "admin", "member"]) expect(isWriter(mk(r))).toBe(true);
    expect(isWriter({ mode: "demo", ctx: {} } as never)).toBe(true);
    expect(isAdmin(mk("member"))).toBe(false);
    expect(isAdmin(mk("admin"))).toBe(true);
  });
});

describe("owner escalation is blocked at the app layer", () => {
  /** workspace_memberships fake: caller role `mine`, target role `target`, `owners` owner rows. */
  function membersClient(mine: string, target: string, owners: number) {
    return fakeClient((table, f) => {
      if (table !== "workspace_memberships") return { data: null, error: null };
      if (f.role === "owner" && f.user_id === undefined) {
        // When the target is an owner it is one of the `owners` owner rows.
        const ids = Array.from({ length: owners }, (_, i) => (i === 0 && target === "owner" ? TARGET : `owner-${i}`));
        return { data: ids.map((user_id) => ({ user_id })), error: null };
      }
      if (f.user_id === USER) return { data: { role: mine }, error: null };
      if (f.user_id === TARGET) return { data: { role: target }, error: null };
      return { data: null, error: null };
    });
  }

  it("an admin cannot promote anyone to owner", async () => {
    await expect(setMemberRoleLocal(WS, TARGET, "owner", ctxWith(membersClient("admin", "member", 1), "admin"))).rejects.toThrow(/^Forbidden/);
  });

  it("an admin cannot demote or remove an owner", async () => {
    await expect(setMemberRoleLocal(WS, TARGET, "member", ctxWith(membersClient("admin", "owner", 2), "admin"))).rejects.toThrow(/^Forbidden/);
    await expect(removeMemberLocal(WS, TARGET, ctxWith(membersClient("admin", "owner", 2), "admin"))).rejects.toThrow(/^Forbidden/);
  });

  it("members cannot manage the team at all", async () => {
    await expect(setMemberRoleLocal(WS, TARGET, "viewer", ctxWith(membersClient("member", "member", 1)))).rejects.toThrow(/^Forbidden/);
  });

  it("even an owner cannot demote the last owner", async () => {
    await expect(setMemberRoleLocal(WS, TARGET, "member", ctxWith(membersClient("owner", "owner", 1), "owner"))).rejects.toThrow(/last owner/i);
  });
});

describe("checklist replace keeps item ids (atomic RPC)", () => {
  it("passes existing item ids through to replace_checklist and returns the rows", async () => {
    const ITEM = "77777777-7777-4777-8777-777777777777";
    let received: { p_assessment?: string; p_items?: Array<{ id: string | null; title: string }> } = {};
    const client = fakeClient(
      () => ({ data: { workspace_id: WS }, error: null }),
      (fn, args) => {
        expect(fn).toBe("replace_checklist");
        received = args as typeof received;
        return { data: [{ id: ITEM, title: "Roof", instructions: null, required: true, ord: 0, category: null, source: "established", rationale: null }], error: null };
      },
    );
    const out = await replaceChecklistItemsLocal(ASSESSMENT, [{ id: ITEM, title: "Roof", required: true }, { id: "tmp-123", title: "New one" }], ctxWith(client));
    expect(received.p_assessment).toBe(ASSESSMENT);
    expect(received.p_items?.[0].id).toBe(ITEM); // preserved
    expect(received.p_items?.[1].id).toBeNull(); // temp client ids are never sent as uuids
    expect(out.persisted).toBe(true);
    expect(out.items[0].id).toBe(ITEM);
  });
});

describe("materials versions are allocated by the server", () => {
  it("ignores the client-supplied version and returns the database version", async () => {
    const client = fakeClient(
      () => ({ data: { workspace_id: WS }, error: null }),
      (fn) => {
        expect(fn).toBe("save_materials_list");
        return { data: [{ list_id: "88888888-8888-4888-8888-888888888888", version: 7 }], error: null };
      },
    );
    const res = await saveMaterialsLocal(
      ASSESSMENT,
      [{ description: "Panel", quantity: 2, unit: "pcs", rationale: "From measurement M1 roof area", source: "measurement", assumptions: ["tilt 15°"] }],
      1, // stale client version — must be ignored
      WS,
      ctxWith(client),
    );
    expect(res.version).toBe(7);
    expect(res.persisted).toBe(true);
  });

  it("a client cannot clear the automatic provisional flag", async () => {
    let sent: Array<{ provisional: boolean }> = [];
    const client = fakeClient(
      () => ({ data: { workspace_id: WS }, error: null }),
      (_fn, args) => {
        sent = (args as { p_items: Array<{ provisional: boolean }> }).p_items;
        return { data: [{ list_id: "88888888-8888-4888-8888-888888888888", version: 1 }], error: null };
      },
    );
    const res = await saveMaterialsLocal(
      ASSESSMENT,
      [{ description: "Cable", quantity: 10, unit: "m", rationale: "short", source: "rule", provisional: false }],
      undefined,
      WS,
      ctxWith(client),
    );
    expect(sent[0].provisional).toBe(true); // rationale < 10 chars => forced provisional
    expect(res.provisionalCount).toBe(1);
  });
});
