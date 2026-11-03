import { describe, it, expect, vi, beforeEach } from "vitest";

const propose = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, sparkProposeChecklist: (...a: unknown[]) => propose(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, aiRunHook: () => undefined, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});

import { POST } from "../../app/api/ai/checklist/route";

const call = (body: unknown) => POST(new Request("http://x/api/ai/checklist", { method: "POST", body: JSON.stringify(body) }));
const facts = (items: Array<{ title: string; instructions?: string; category?: string }>) => ({ assessment: { mode: "assessment", pack: "solar", context: {} }, scenario: "new_install", items, responses: [], evidenceIds: [] });

beforeEach(() => {
  propose.mockReset();
  loadFacts.mockReset();
  propose.mockResolvedValue({ items: [], warnings: [], skipped: [] });
});

describe("POST /api/ai/checklist: what the AI is told is already on the checklist", () => {
  it("sends the saved items with what each covers", async () => {
    loadFacts.mockResolvedValue(facts([{ title: "Orientation, tilt, shading survey", instructions: "Note which way the surface faces.", category: "Site" }]));
    await call({ assessmentId: "a1" });
    expect(propose.mock.calls[0][0].existingChecklist).toEqual([{ title: "Orientation, tilt, shading survey", covers: "Note which way the surface faces.", category: "Site" }]);
  });

  it("adds items shown on the screen that are not saved yet (typed items, earlier suggestions), once each", async () => {
    loadFacts.mockResolvedValue(facts([{ title: "Load audit — demand & operating hours", instructions: "Loads and hours." }]));
    await call({ assessmentId: "a1", currentItems: [{ title: "load audit — demand & operating hours" }, { title: "Surge protection devices", category: "AI suggested" }] });
    const sent = propose.mock.calls[0][0].existingChecklist as Array<{ title: string; covers?: string }>;
    expect(sent.map((s) => s.title)).toEqual(["Load audit — demand & operating hours", "Surge protection devices"]);
    expect(sent[0].covers).toBe("Loads and hours."); // the saved guidance is kept
  });

  it("when nothing is saved yet, tells the AI about the pack's own template so it is never proposed back as new", async () => {
    loadFacts.mockResolvedValue(facts([]));
    await call({ assessmentId: "a1" });
    const titles = (propose.mock.calls[0][0].existingChecklist as Array<{ title: string }>).map((s) => s.title);
    expect(titles).toContain("Roof / structure / mounting constraints");
    expect(titles).toContain("Orientation, tilt, shading survey");
  });

  it("passes back what was left out as a repeat", async () => {
    loadFacts.mockResolvedValue(facts([{ title: "Orientation, tilt, shading survey" }]));
    propose.mockResolvedValue({ items: [], warnings: [], skipped: [{ title: "Shading analysis", duplicateOf: "Orientation, tilt, shading survey" }] });
    const out = await (await call({ assessmentId: "a1" })).json();
    expect(out.skipped).toEqual([{ title: "Shading analysis", duplicateOf: "Orientation, tilt, shading survey" }]);
  });
});
