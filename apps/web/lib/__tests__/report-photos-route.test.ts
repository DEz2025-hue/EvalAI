import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiAdapterError, PHOTO_REVIEW_VERSION } from "@eval-ai/ai-adapter";

const photoReview = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, photoReview: (...a: unknown[]) => photoReview(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});
const listEvidenceLocal = vi.fn();
const updateContext = vi.fn();
vi.mock("../store", () => ({
  listEvidenceLocal: (...a: unknown[]) => listEvidenceLocal(...a),
  updateAssessmentContextLocal: (...a: unknown[]) => updateContext(...a),
  // The site facts sent with the photos (D-035).
  buildSiteBrief: () => ({ address: "1 Test Road", intakeText: "Flat roof" }),
}));
const preparePhotos = vi.fn();
vi.mock("../reportPhotos", async (orig) => {
  const real = await orig<typeof import("../reportPhotos")>();
  return { ...real, preparePhotos: (...a: unknown[]) => preparePhotos(...a) };
});

import { POST } from "../../app/api/ai/report-photos/route";

const call = (body: unknown) => POST(new Request("http://x/api/ai/report-photos", { method: "POST", body: JSON.stringify(body) }));
const ev = (id: string, itemId: string | null = null) => ({ id, assessmentId: "job-1", itemId, storageKey: `evidence/job-1/${id}-x.jpg`, mimeType: "image/jpeg", sizeBytes: 100, uploadedAt: `2026-01-0${id.slice(-1)}` });
const prepared = (ids: string[]) => ({ photos: ids.map((id) => ({ evidenceId: id, itemId: null, capturedAt: "x", aiBase64: "QUJD", thumbnail: "" })), failed: [] as string[] });
const result = (id: string) => ({ evidenceId: id, caption: `Caption ${id}`, observations: ["Something visible"], possibleIssues: [], cannotTell: [] });

beforeEach(() => {
  photoReview.mockReset();
  preparePhotos.mockReset();
  listEvidenceLocal.mockReset();
  updateContext.mockReset();
  loadFacts.mockReset();
  loadFacts.mockResolvedValue({
    assessment: { mode: "assessment", pack: "solar", context: { goal: "Check the array" } },
    scenario: "existing",
    items: [{ id: "i1", title: "Inverter", required: true }],
    responses: [{ itemId: "i1", status: "fail", notes: "Error shown" }],
    evidenceIds: [],
  });
  updateContext.mockResolvedValue(true);
});

describe("POST /api/ai/report-photos", () => {
  it("looks at the job's photos with the server's checklist answers and saves the results on the job", async () => {
    listEvidenceLocal.mockResolvedValue({ items: [ev("e1", "i1"), ev("e2")], persisted: true });
    preparePhotos.mockImplementation(async (_id: string, items: Array<{ id: string; itemId: string | null }>) => ({ photos: items.map((e) => ({ evidenceId: e.id, itemId: e.itemId, capturedAt: "x", aiBase64: "QUJD", thumbnail: "" })), failed: [] }));
    photoReview.mockResolvedValue({ photos: [result("e1"), result("e2")], notAnalyzed: [], requiresHumanReview: true });
    const res = await call({ assessmentId: "job-1", checklist: [{ id: "fake", title: "Fake" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ analyzed: 2, cached: 0, skipped: 0, failed: [], total: 2 });
    const sent = photoReview.mock.calls[0][0];
    expect(sent).toMatchObject({ mode: "assessment", pack: "solar", scenario: "existing", goal: "Check the array" });
    expect(sent.checklist).toEqual([{ id: "i1", title: "Inverter", status: "fail", notes: "Error shown" }]);
    expect(sent.siteBrief).toMatchObject({ address: "1 Test Road", intake: "Flat roof" });
    expect(sent.photos).toHaveLength(2);
    const saved = updateContext.mock.calls[0][1].context.photoReview;
    expect(Object.keys(saved)).toEqual(["e1", "e2"]);
    expect(saved.e1).toMatchObject({ caption: "Caption e1", itemId: "i1", v: PHOTO_REVIEW_VERSION });
  });

  it("looks again at photos whose saved review was made the older way, and keeps current ones", async () => {
    loadFacts.mockResolvedValue({
      assessment: { mode: "assessment", pack: "solar", context: { photoReview: { e1: { ...result("e1"), itemId: null, at: "t" }, e2: { ...result("e2"), itemId: null, at: "t", v: PHOTO_REVIEW_VERSION } } } },
      scenario: undefined,
      items: [],
      responses: [],
      evidenceIds: [],
    });
    listEvidenceLocal.mockResolvedValue({ items: [ev("e1"), ev("e2")], persisted: true });
    preparePhotos.mockResolvedValue(prepared(["e1"]));
    photoReview.mockResolvedValue({ photos: [result("e1")], notAnalyzed: [], requiresHumanReview: true });
    expect(await (await call({ assessmentId: "job-1" })).json()).toMatchObject({ analyzed: 1, cached: 1 });
    expect(preparePhotos.mock.calls[0][1].map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(updateContext.mock.calls[0][1].context.photoReview.e1.v).toBe(PHOTO_REVIEW_VERSION);
  });

  it("does not pay twice for a photo that was already reviewed, unless forced", async () => {
    loadFacts.mockResolvedValue({
      assessment: { mode: "assessment", pack: "solar", context: { photoReview: { e1: { ...result("e1"), itemId: null, at: "t", v: PHOTO_REVIEW_VERSION } } } },
      scenario: undefined,
      items: [],
      responses: [],
      evidenceIds: [],
    });
    listEvidenceLocal.mockResolvedValue({ items: [ev("e1"), ev("e2")], persisted: true });
    preparePhotos.mockResolvedValue(prepared(["e2"]));
    photoReview.mockResolvedValue({ photos: [result("e2")], notAnalyzed: [], requiresHumanReview: true });
    expect(await (await call({ assessmentId: "job-1" })).json()).toMatchObject({ analyzed: 1, cached: 1 });
    expect(preparePhotos.mock.calls[0][1].map((e: { id: string }) => e.id)).toEqual(["e2"]);
    // The saved results are kept alongside the new one.
    expect(Object.keys(updateContext.mock.calls[0][1].context.photoReview).sort()).toEqual(["e1", "e2"]);
    preparePhotos.mockResolvedValue(prepared(["e1", "e2"]));
    photoReview.mockResolvedValue({ photos: [result("e1"), result("e2")], notAnalyzed: [], requiresHumanReview: true });
    expect(await (await call({ assessmentId: "job-1", force: true })).json()).toMatchObject({ analyzed: 2, cached: 0 });
  });

  it("with everything already reviewed it calls nothing", async () => {
    loadFacts.mockResolvedValue({ assessment: { mode: "assessment", pack: "solar", context: { photoReview: { e1: { ...result("e1"), itemId: null, at: "t", v: PHOTO_REVIEW_VERSION } } } }, scenario: undefined, items: [], responses: [], evidenceIds: [] });
    listEvidenceLocal.mockResolvedValue({ items: [ev("e1")], persisted: true });
    expect(await (await call({ assessmentId: "job-1" })).json()).toMatchObject({ analyzed: 0, cached: 1 });
    expect(photoReview).not.toHaveBeenCalled();
    expect(updateContext).not.toHaveBeenCalled();
  });

  it("reports how many photos did not fit and sends four at a time", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ev("e" + i));
    listEvidenceLocal.mockResolvedValue({ items: many.concat([ev("e9"), ev("e10"), ev("e11"), ev("e12"), ev("e13")]), persisted: true });
    preparePhotos.mockImplementation(async (_id: string, items: Array<{ id: string }>) => prepared(items.map((i) => i.id)));
    photoReview.mockImplementation(async (input: { photos: Array<{ evidenceId: string }> }) => ({ photos: input.photos.map((p) => result(p.evidenceId)), notAnalyzed: [], requiresHumanReview: true }));
    const data = (await (await call({ assessmentId: "job-1" })).json()) as { analyzed: number; skipped: number; total: number };
    expect(data).toMatchObject({ analyzed: 12, skipped: 2, total: 12 });
    expect(photoReview.mock.calls.map((c) => c[0].photos.length).sort()).toEqual([4, 4, 4]);
  });

  it("keeps what worked when one batch fails, and lists the photos that failed", async () => {
    listEvidenceLocal.mockResolvedValue({ items: Array.from({ length: 6 }, (_, i) => ev("e" + i)), persisted: true });
    preparePhotos.mockImplementation(async (_id: string, items: Array<{ id: string }>) => prepared(items.map((i) => i.id)));
    photoReview.mockImplementationOnce(async (input: { photos: Array<{ evidenceId: string }> }) => ({ photos: input.photos.map((p) => result(p.evidenceId)), notAnalyzed: [], requiresHumanReview: true })).mockRejectedValueOnce(new AiAdapterError("slow", "timeout"));
    const data = (await (await call({ assessmentId: "job-1" })).json()) as { analyzed: number; failed: string[] };
    expect(data.analyzed).toBe(4);
    expect(data.failed).toHaveLength(2);
    expect(updateContext).toHaveBeenCalledTimes(1);
  });

  it("says why when nothing could be analysed (credit, key) instead of an empty success", async () => {
    listEvidenceLocal.mockResolvedValue({ items: [ev("e1")], persisted: true });
    preparePhotos.mockResolvedValue(prepared(["e1"]));
    photoReview.mockRejectedValue(new AiAdapterError("billing", "billing", 402, "billing_not_configured"));
    const res = await call({ assessmentId: "job-1" });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/billing_not_configured/);
    expect(updateContext).not.toHaveBeenCalled();
  });
});
