import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../auth", async (orig) => {
  const real = await orig<typeof import("../auth")>();
  return { ...real, requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) };
});
const save = vi.fn();
vi.mock("../store", async (orig) => {
  const real = await orig<typeof import("../store")>();
  return {
    ...real,
    verifyAssessmentWorkspace: async () => undefined,
    getChecklistItemsLocal: async () => [
      { id: "item-req", title: "Roof", required: true },
      { id: "item-opt", title: "Extra", required: false },
    ],
    saveResponsesLocal: (...a: unknown[]) => save(...a),
  };
});

import { POST } from "../../app/api/checklist/responses/route";

const call = (responses: unknown[]) => POST(new Request("http://x/api/checklist/responses", { method: "POST", body: JSON.stringify({ assessmentId: "job-1", responses }) }));

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, persisted: false, saved: 1 });
});

describe("POST /api/checklist/responses enforces the answer rules", () => {
  it("refuses a measured value without a unit", async () => {
    const res = await call([{ itemId: "item-opt", status: "pass", measuredValue: 2.5 }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unit/);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses Not Applicable on a required item without a reason", async () => {
    const res = await call([{ itemId: "item-req", status: "not_applicable" }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reason/);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses an answer for an item that isn't on this job's checklist", async () => {
    const res = await call([{ itemId: "gone", status: "pass" }]);
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves answers that meet the rules", async () => {
    const res = await call([
      { itemId: "item-req", status: "not_applicable", notes: "Ground mount, no roof" },
      { itemId: "item-opt", status: "pass", measuredValue: 2.5, measuredUnit: "m" },
    ]);
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
