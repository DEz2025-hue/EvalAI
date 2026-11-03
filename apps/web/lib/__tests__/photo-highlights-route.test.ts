import { beforeEach, describe, expect, it, vi } from "vitest";

const samSegment = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => ({ ...(await orig<typeof import("@eval-ai/ai-adapter")>()), samSegment: (...a: unknown[]) => samSegment(...a) }));
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => ({ ...(await orig<typeof import("../aiRoute")>()), aiGuard: async () => null, aiRunHook: () => undefined, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) }));
const evidence = vi.fn();
const updateContext = vi.fn();
vi.mock("../store", () => ({ listEvidenceLocal: (...a: unknown[]) => evidence(...a), updateAssessmentContextLocal: (...a: unknown[]) => updateContext(...a) }));
const preparePhotos = vi.fn();
vi.mock("../reportPhotos", async (orig) => ({ ...(await orig<typeof import("../reportPhotos")>()), preparePhotos: (...a: unknown[]) => preparePhotos(...a) }));

import { POST } from "../../app/api/ai/photo-highlights/route";

const call = () => POST(new Request("http://x/api/ai/photo-highlights", { method: "POST", body: JSON.stringify({ assessmentId: "a1" }) }));
const ev = (id: string) => ({ id, mimeType: "image/jpeg", uploadedAt: id });
const review = (id: string, issues: Array<{ text: string; find?: string }>) => ({ [id]: { at: "t1", possibleIssues: issues.map((i) => ({ confidence: "medium", ...i })) } });
const context = (over: Record<string, unknown>) => loadFacts.mockResolvedValue({ assessment: { context: over } });
const savedHighlights = () => (updateContext.mock.calls[0][1] as { context: { photoHighlights: Record<string, { reviewAt: string; items: Array<{ label: string }> }> } }).context.photoHighlights;

beforeEach(() => {
  for (const m of [samSegment, loadFacts, evidence, updateContext, preparePhotos]) m.mockReset();
  evidence.mockResolvedValue({ items: [ev("e1"), ev("e2"), ev("e3")] });
  preparePhotos.mockImplementation(async (_a: string, items: Array<{ id: string }>) => ({ photos: items.map((e) => ({ evidenceId: e.id, aiBase64: "QUJD", thumbnail: "" })), failed: [] }));
  samSegment.mockResolvedValue({ boxes: [{ ordinal: 0, x1: 0, y1: 0, x2: 29, y2: 29, w: 100, h: 100, c: 0.9 }] });
});

describe("POST /api/ai/photo-highlights", () => {
  it("only looks at photos the person added, with the phrase the review wrote, and saves the outlines under the issue's text", async () => {
    context({ photoReview: { ...review("e1", [{ text: "Palms may shade the roof", find: "palm tree" }, { text: "Cannot be pointed at" }]), ...review("e2", [{ text: "Left out", find: "rust" }]) }, photoChoices: { e1: true, e2: false } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ done: 1, outlined: 1, remaining: 0, requiresHumanReview: true });
    expect(samSegment).toHaveBeenCalledTimes(1);
    expect((samSegment.mock.calls[0][0] as { prompt: string }).prompt).toBe("palm tree");
    expect(savedHighlights().e1).toMatchObject({ reviewAt: "t1", items: [{ label: "Palms may shade the roof" }] });
    expect(savedHighlights().e2).toBeUndefined();
  });

  it("does not repeat a photo already done from the same review, and redoes it after a new review", async () => {
    const photoReview = review("e1", [{ text: "T", find: "rust" }]);
    context({ photoReview, photoChoices: { e1: true }, photoHighlights: { e1: { reviewAt: "t1", items: [] } } });
    expect(await (await call()).json()).toMatchObject({ done: 0, remaining: 0 });
    expect(samSegment).not.toHaveBeenCalled();
    expect(updateContext).not.toHaveBeenCalled();

    context({ photoReview, photoChoices: { e1: true }, photoHighlights: { e1: { reviewAt: "older", items: [] } } });
    expect(await (await call()).json()).toMatchObject({ done: 1 });
  });

  it("makes no call or picture for a photo with nothing to look for, and remembers that", async () => {
    context({ photoReview: review("e1", [{ text: "Hidden wiring" }]), photoChoices: { e1: true } });
    expect(await (await call()).json()).toMatchObject({ done: 0, remaining: 0 });
    expect(samSegment).not.toHaveBeenCalled();
    expect(savedHighlights().e1).toEqual({ reviewAt: "t1", items: [] });
  });

  it("keeps what worked when one photo fails, and says which", async () => {
    context({ photoReview: { ...review("e1", [{ text: "A", find: "rust" }]), ...review("e2", [{ text: "B", find: "stain" }]) }, photoChoices: { e1: true, e2: true } });
    samSegment.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (prompt === "stain") throw new Error("overloaded");
      return { boxes: [] };
    });
    expect(await (await call()).json()).toMatchObject({ done: 1, failed: ["e2"] });
    expect(Object.keys(savedHighlights())).toEqual(["e1"]);
  });

  it("reports the reason when nothing worked", async () => {
    context({ photoReview: review("e1", [{ text: "A", find: "rust" }]), photoChoices: { e1: true } });
    samSegment.mockRejectedValue(new Error("The AI service timed out"));
    expect((await call()).status).toBe(504);
    expect(updateContext).not.toHaveBeenCalled();
  });
});
