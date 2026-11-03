import { describe, it, expect, vi, beforeEach } from "vitest";

const createAssessmentLocal = vi.fn();
const getAssessmentLocal = vi.fn();
const updateAssessmentContextLocal = vi.fn();
vi.mock("../auth", () => ({
  requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }),
  requireAuth: async () => ({ auth: { mode: "demo", ctx: {} } }),
  workspaceIdFor: () => undefined,
  storeError: (e: unknown) => new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 400 }),
}));
vi.mock("../store", () => ({
  createAssessmentLocal: (...a: unknown[]) => createAssessmentLocal(...a),
  listAssessmentsLocal: async () => [],
  getAssessmentLocal: (...a: unknown[]) => getAssessmentLocal(...a),
  getResponsesLocal: async () => [],
  getChecklistItemsLocal: async () => [],
  verifyAssessmentWorkspace: async () => undefined,
  updateAssessmentContextLocal: (...a: unknown[]) => updateAssessmentContextLocal(...a),
}));

import { POST } from "../../app/api/assessments/route";
import { PATCH } from "../../app/api/assessments/[id]/route";

const create = (body: unknown) => POST(new Request("http://x/api/assessments", { method: "POST", body: JSON.stringify(body) }));
const patch = (body: unknown) => PATCH(new Request("http://x/api/assessments/a1", { method: "PATCH", body: JSON.stringify(body) }), { params: { id: "a1" } });
const base = { pack: "solar", siteName: "12 Acacia Rd" };

beforeEach(() => {
  createAssessmentLocal.mockReset();
  getAssessmentLocal.mockReset();
  updateAssessmentContextLocal.mockReset();
  createAssessmentLocal.mockResolvedValue({ id: "a1", persisted: true, items: [] });
  updateAssessmentContextLocal.mockResolvedValue(true);
});

describe("creating a job with a site situation", () => {
  it("keeps the choice for an assessment", async () => {
    const res = await create({ ...base, mode: "assessment", scenario: "new_install" });
    expect(res.status).toBe(200);
    expect(createAssessmentLocal.mock.calls[0][0].scenario).toBe("new_install");
    expect(((await res.json()) as { scenario: string }).scenario).toBe("new_install");
  });
  it("an inspection is always an existing system, whatever the client sends", async () => {
    await create({ ...base, mode: "inspection", scenario: "new_install" });
    await create({ ...base, mode: "inspection" });
    expect(createAssessmentLocal.mock.calls.map((c) => c[0].scenario)).toEqual(["existing", "existing"]);
  });
  it("an assessment without a choice is left not set, as older clients send it", async () => {
    await create({ ...base, mode: "assessment" });
    expect(createAssessmentLocal.mock.calls[0][0].scenario).toBeNull();
  });
  it("rejects an unknown situation", async () => {
    const res = await create({ ...base, mode: "assessment", scenario: "demolition" });
    expect(res.status).toBe(400);
    expect(createAssessmentLocal).not.toHaveBeenCalled();
  });
});

describe("setting the situation on an existing job", () => {
  const job = (mode: string, scenario?: string) => ({ id: "a1", mode, pack: "solar", context: scenario ? { scenario } : {} });
  it("can be set once on an assessment that has none", async () => {
    getAssessmentLocal.mockResolvedValue(job("assessment"));
    const res = await patch({ context: { scenario: "new_install" } });
    expect(res.status).toBe(200);
    expect(updateAssessmentContextLocal.mock.calls[0][1].context.scenario).toBe("new_install");
  });
  it("cannot be changed once set, and an invalid value is refused", async () => {
    getAssessmentLocal.mockResolvedValue(job("assessment", "existing"));
    expect((await patch({ context: { scenario: "new_install" } })).status).toBe(409);
    expect((await patch({ context: { scenario: "banana" } })).status).toBe(400);
    expect(updateAssessmentContextLocal).not.toHaveBeenCalled();
  });
  it("an inspection is stored as an existing system whatever is sent", async () => {
    getAssessmentLocal.mockResolvedValue(job("inspection"));
    await patch({ context: { scenario: "new_install" } });
    expect(updateAssessmentContextLocal.mock.calls[0][1].context.scenario).toBe("existing");
  });
  it("other context edits do not touch the situation", async () => {
    await patch({ context: { goal: "check inverter" } });
    expect(getAssessmentLocal).not.toHaveBeenCalled();
    expect(updateAssessmentContextLocal.mock.calls[0][1].context).toEqual({ goal: "check inverter" });
  });
});
