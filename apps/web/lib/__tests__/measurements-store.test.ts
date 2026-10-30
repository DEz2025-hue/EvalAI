import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveMeasurementLocal, type StoreCtx } from "../store";

const WS = "11111111-1111-4111-8111-111111111111";
const ASSESSMENT = "55555555-5555-4555-8555-555555555555";

/** Records the row that would be inserted; the assessment lookup says the job is in the caller's workspace. */
function recordingClient() {
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      let op = "select";
      let row: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.insert = (r: Record<string, unknown>) => {
        op = "insert";
        row = r;
        if (table === "measurements") inserted.push(r);
        return b;
      };
      const result = () =>
        table === "assessments"
          ? { data: { workspace_id: WS }, error: null }
          : { data: { id: "99999999-9999-4999-8999-999999999999", assessment_id: ASSESSMENT, item_id: null, name: row.name, formula: row.formula, method: row.method, inputs: row.inputs, value: row.value, unit: row.unit, note: null, created_at: "2026-10-30T00:00:00Z" }, error: null };
      b.single = () => Promise.resolve(result());
      b.maybeSingle = () => Promise.resolve(result());
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve(op === "insert" ? { data: null, error: null } : result()).then(ok);
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, inserted };
}

const ctx = (client: SupabaseClient): StoreCtx => ({ supabase: client, userId: "33333333-3333-4333-8333-333333333333", workspaceId: WS, role: "member" });

describe("recorded measurements", () => {
  it("computes the result on the server and stores the formula, method and inputs", async () => {
    const { client, inserted } = recordingClient();
    const rec = await saveMeasurementLocal({
      assessmentId: ASSESSMENT,
      name: "North roof",
      formula: "area",
      inputs: { length: { value: 10, unit: "m" }, width: { value: 600, unit: "cm" } },
      // A client-supplied result must be ignored.
      value: 9999,
      unit: "bogus",
      ctx: ctx(client),
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].value).toBe(60);
    expect(inserted[0].unit).toBe("m²");
    expect(inserted[0].formula).toBe("area");
    expect(String(inserted[0].method)).toMatch(/length × width/);
    expect((inserted[0].inputs as Record<string, { unit: string }>).width.unit).toBe("cm");
    expect(rec.value).toBe(60);
  });

  it("rejects bad inputs before touching the database", async () => {
    const { client, inserted } = recordingClient();
    await expect(
      saveMeasurementLocal({ assessmentId: ASSESSMENT, name: "x", formula: "area", inputs: { length: { value: -5, unit: "m" }, width: { value: 2, unit: "m" } }, ctx: ctx(client) }),
    ).rejects.toThrow(/greater than zero/);
    expect(inserted).toHaveLength(0);
  });

  it("manual readings need a value and a unit and are labelled as manual entry", async () => {
    const { client, inserted } = recordingClient();
    await expect(saveMeasurementLocal({ assessmentId: ASSESSMENT, name: "Voltage", formula: "manual", value: 230, ctx: ctx(client) })).rejects.toThrow(/unit/i);
    await saveMeasurementLocal({ assessmentId: ASSESSMENT, name: "Voltage", formula: "manual", value: 230, unit: "V", ctx: ctx(client) });
    expect(inserted[0].value).toBe(230);
    expect(String(inserted[0].method)).toMatch(/manual entry/);
  });
});
