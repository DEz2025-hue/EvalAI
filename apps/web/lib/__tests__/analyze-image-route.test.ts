import { describe, it, expect, vi, beforeEach } from "vitest";
import { photoAnalysisText, photoFitLine } from "@eval-ai/shared";

// One photo is read for its job and checklist item (D-035): the server builds that context from stored data.

const analyzeImage = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, analyzeImage: (...a: unknown[]) => analyzeImage(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, aiRunHook: () => undefined, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});

import { POST } from "../../app/api/ai/analyze-image/route";

const call = (body: unknown) => POST(new Request("http://x/api/ai/analyze-image", { method: "POST", body: JSON.stringify(body) }));

const facts = {
  assessment: { siteName: "Palm Road house", mode: "assessment", pack: "solar", address: "12 Palm Road", context: { goal: "Rooftop solar", existingEquipment: "None", intake: { description: "Single-storey house, metal roof", visible: ["Tree to the west"], limitations: [] } } },
  scenario: "new_install",
  items: [
    { id: "it-roof", title: "Roof condition and orientation", category: "Site", instructions: "Roof material, condition, shading and the best area for panels." },
    { id: "it-loads", title: "Load details", category: "Customer", instructions: "Each appliance with its nameplate rating." },
  ],
  responses: [{ itemId: "it-loads", status: "needs_attention", notes: "Two ACs, one fridge" }],
  evidenceIds: [],
};

beforeEach(() => {
  analyzeImage.mockReset();
  loadFacts.mockReset();
  loadFacts.mockResolvedValue(facts);
  analyzeImage.mockResolvedValue({ summary: "An AC outdoor unit.", fit: "yes", relevance: "", betterItems: [], observations: [], readings: [], suggestions: [], possibleIssues: [], suggestedNote: "", limitations: [], uncertainty: "low", requiresHumanReview: true });
});

describe("POST /api/ai/analyze-image", () => {
  it("sends the job and the linked item with what it asks for and what was recorded", async () => {
    const res = await call({ imageBase64: "QUJD", assessmentId: "job-1", itemId: "it-loads" });
    expect(res.status).toBe(200);
    const sent = analyzeImage.mock.calls[0][0];
    expect(sent.context).toMatchObject({ pack: "solar", mode: "assessment", scenario: "new_install", goal: "Rooftop solar" });
    expect(sent.context.item).toEqual({ title: "Load details", category: "Customer", lookFor: "Each appliance with its nameplate rating.", status: "needs_attention", notes: "Two ACs, one fridge" });
    expect(sent.context.otherItems).toEqual(["Roof condition and orientation"]);
    expect(sent.context.siteBrief).toMatchObject({ address: "12 Palm Road", intake: "Single-storey house, metal roof", seenAtIntake: ["Tree to the west"] });
    expect((await res.json()).itemTitle).toBe("Load details");
  });

  it("an item that is not on the job is not used; the photo is still read for the job", async () => {
    await call({ imageBase64: "QUJD", assessmentId: "job-1", itemId: "someone-elses-item" });
    const sent = analyzeImage.mock.calls[0][0];
    expect(sent.context.item).toBeNull();
    expect(sent.context.otherItems).toHaveLength(2);
  });

  it("without a job no context is loaded", async () => {
    await call({ imageBase64: "QUJD" });
    expect(loadFacts).not.toHaveBeenCalled();
    expect(analyzeImage.mock.calls[0][0].context).toBeUndefined();
  });
});

describe("how an analysis is shown", () => {
  const a = {
    summary: "A split AC outdoor unit on a wall bracket.",
    fit: "partly" as const,
    itemTitle: "Roof condition and orientation",
    betterItems: ["Load details"],
    readings: [{ label: "Cooling capacity", value: "18,000 BTU/h" }],
    suggestions: ["Add this unit to the load list."],
    suggestedNote: "Split AC, label reads 18,000 BTU/h.",
    uncertainty: "low",
  };

  it("says whether the photo fits its item and where it fits better", () => {
    expect(photoFitLine(a)).toBe('Partly useful for "Roof condition and orientation". Better for: Load details.');
    expect(photoFitLine({ summary: "x", fit: "no_item" })).toBe("");
  });

  it("lists readings as printed and not verified, suggestions to confirm, the draft note, and confidence the right way round", () => {
    const t = photoAnalysisText(a);
    expect(t).toContain("Label readings (as printed, not verified):\n• Cooling capacity: 18,000 BTU/h");
    expect(t).toContain("Suggestions (confirm on site):\n• Add this unit to the load list.");
    expect(t).toContain("Suggested note: Split AC, label reads 18,000 BTU/h.");
    // Low uncertainty means high confidence.
    expect(t).toContain("Confidence: high");
  });
});
