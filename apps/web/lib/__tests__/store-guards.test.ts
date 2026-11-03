import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAssessmentLocal,
  getAssessmentLocal,
  verifyAssessmentWorkspace,
  setMemberRoleLocal,
  removeMemberLocal,
  replaceChecklistItemsLocal,
  getChecklistItemsLocal,
  getResponsesLocal,
  saveResponsesLocal,
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

  it("keeps stored guidance, rationale and required when a screen leaves them out", async () => {
    const ITEM = "77777777-7777-4777-8777-777777777777";
    let sent: Array<{ instructions: string | null; rationale: string | null; required: boolean }> = [];
    const client = fakeClient(
      (table) =>
        table === "checklist_items"
          ? { data: [{ id: ITEM, instructions: "Sharpened by site intake", required: true, rationale: "Tree to the north-west" }], error: null }
          : { data: { workspace_id: WS }, error: null },
      (_fn, args) => {
        sent = (args as { p_items: typeof sent }).p_items;
        return { data: [], error: null };
      },
    );
    await replaceChecklistItemsLocal(ASSESSMENT, [{ id: ITEM, title: "Shading" }, { id: "tmp-1", title: "New one" }], ctxWith(client));
    expect(sent[0]).toMatchObject({ instructions: "Sharpened by site intake", rationale: "Tree to the north-west", required: true });
    expect(sent[1]).toMatchObject({ instructions: null, rationale: null, required: false });
  });

  it("an explicit value still replaces the stored one", async () => {
    const ITEM = "77777777-7777-4777-8777-777777777777";
    let sent: Array<{ instructions: string | null; required: boolean }> = [];
    const client = fakeClient(
      (table) => (table === "checklist_items" ? { data: [{ id: ITEM, instructions: "Old", required: true, rationale: null }], error: null } : { data: { workspace_id: WS }, error: null }),
      (_fn, args) => {
        sent = (args as { p_items: typeof sent }).p_items;
        return { data: [], error: null };
      },
    );
    await replaceChecklistItemsLocal(ASSESSMENT, [{ id: ITEM, title: "Shading", instructions: "New", required: false }], ctxWith(client));
    expect(sent[0]).toMatchObject({ instructions: "New", required: false });
  });

  it("refuses a list built from template rows with made-up ids instead of replacing the real checklist", async () => {
    let called = false;
    const client = fakeClient(
      () => ({ data: { workspace_id: WS }, error: null }),
      () => {
        called = true;
        return { data: [], error: null };
      },
    );
    const err = await replaceChecklistItemsLocal(ASSESSMENT, [{ id: `${ASSESSMENT}_item_0`, title: "Roof" }], ctxWith(client)).catch((e) => e as Error);
    expect((err as Error).name).toBe("DbConflict");
    expect(storeError(err).status).toBe(409);
    expect(called).toBe(false);
  });
});

describe("saving answers", () => {
  const I1 = "77777777-7777-4777-8777-777777777777";
  const I2 = "99999999-9999-4999-8999-999999999999";
  const SAVED = "2026-11-01T10:00:00.000Z";

  /** Fake whose checklist_responses read returns `stored`; counts upserts. */
  function answersClient(stored: Array<{ item_id: string; updated_at: string }>) {
    const calls = { upserts: 0 };
    const client = fakeClient((table, _f, op) => {
      if (table === "assessments") return { data: { workspace_id: WS }, error: null };
      if (table === "checklist_responses" && op === "upsert") {
        calls.upserts += 1;
        return { data: null, error: null };
      }
      if (table === "checklist_responses") return { data: stored, error: null };
      return { data: null, error: null };
    });
    return { client, calls };
  }

  it("saves several answers in one statement and returns the saved time", async () => {
    const { client, calls } = answersClient([]);
    const res = await saveResponsesLocal(ASSESSMENT, [{ itemId: I1, status: "pass" }, { itemId: I2, status: "fail", notes: "Cracked" }], ctxWith(client));
    expect(calls.upserts).toBe(1);
    expect(res.saved).toBe(2);
    expect(Number.isNaN(new Date(res.updatedAt).getTime())).toBe(false);
  });

  it("refuses to overwrite an answer saved elsewhere after the screen loaded it", async () => {
    const { client, calls } = answersClient([{ item_id: I1, updated_at: "2026-11-01T10:05:00.000Z" }]);
    const err = await saveResponsesLocal(ASSESSMENT, [{ itemId: I1, status: "pass", baseUpdatedAt: SAVED }], ctxWith(client)).catch((e) => e as Error);
    expect((err as Error).name).toBe("DbConflict");
    expect(storeError(err).status).toBe(409);
    expect(calls.upserts).toBe(0);
  });

  it("refuses when the screen thought the item was never answered but it has been since", async () => {
    const { client, calls } = answersClient([{ item_id: I1, updated_at: SAVED }]);
    const err = await saveResponsesLocal(ASSESSMENT, [{ itemId: I1, status: "pass", baseUpdatedAt: null }], ctxWith(client)).catch((e) => e as Error);
    expect((err as Error).name).toBe("DbConflict");
    expect(calls.upserts).toBe(0);
  });

  it("saves when the stored answer is the one the screen loaded (Postgres may add microseconds)", async () => {
    const { client, calls } = answersClient([{ item_id: I1, updated_at: "2026-11-01T10:00:00+00:00" }]);
    await saveResponsesLocal(ASSESSMENT, [{ itemId: I1, status: "fail", baseUpdatedAt: SAVED }], ctxWith(client));
    expect(calls.upserts).toBe(1);
  });

  it("a stale answer blocks the whole batch: nothing is half-saved", async () => {
    const { client, calls } = answersClient([{ item_id: I2, updated_at: "2026-11-01T11:00:00.000Z" }]);
    const err = await saveResponsesLocal(ASSESSMENT, [{ itemId: I1, status: "pass", baseUpdatedAt: null }, { itemId: I2, status: "pass", baseUpdatedAt: SAVED }], ctxWith(client)).catch((e) => e as Error);
    expect((err as Error).name).toBe("DbConflict");
    expect(calls.upserts).toBe(0);
  });
});

describe("checklist reads fail loudly", () => {
  it("a database error reading items is an error, not an empty checklist", async () => {
    const client = fakeClient(() => ({ data: null, error: { code: "XX000", message: "boom" } }));
    await expect(getChecklistItemsLocal(ASSESSMENT, ctxWith(client))).rejects.toThrow();
  });

  it("a database error reading answers is an error, not 'nothing answered'", async () => {
    const client = fakeClient(() => ({ data: null, error: { code: "XX000", message: "boom" } }));
    await expect(getResponsesLocal(ASSESSMENT, ctxWith(client))).rejects.toThrow();
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

  it("AI-suggested items with an assumption are always provisional, and the source is stored as given", async () => {
    let sent: Array<{ provisional: boolean; source: string }> = [];
    const client = fakeClient(
      () => ({ data: { workspace_id: WS }, error: null }),
      (_fn, args) => {
        sent = (args as { p_items: Array<{ provisional: boolean; source: string }> }).p_items;
        return { data: [{ list_id: "88888888-8888-4888-8888-888888888888", version: 2 }], error: null };
      },
    );
    const res = await saveMaterialsLocal(
      ASSESSMENT,
      [
        { description: "Module", quantity: 12, unit: "pcs", rationale: "Rule pv_modules_by_target: 5 kW at 450 W", source: "ai_suggested", provisional: false, assumptions: ["Module rating assumed 450 W"] },
        { description: "Recorder", quantity: 8, unit: "channels", rationale: "Rule cctv_recorder_channels: 6 cameras recorded", source: "ai_suggested", provisional: false, assumptions: [] },
      ],
      undefined,
      WS,
      ctxWith(client),
    );
    expect(sent.map((s) => s.source)).toEqual(["ai_suggested", "ai_suggested"]);
    expect(sent.map((s) => s.provisional)).toEqual([true, false]);
    expect(res.provisionalCount).toBe(1);
  });
});
