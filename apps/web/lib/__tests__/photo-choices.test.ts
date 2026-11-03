import { describe, it, expect, vi, beforeEach } from "vitest";

const getAssessmentLocal = vi.fn();
const listEvidenceLocal = vi.fn();
const updateContext = vi.fn();
vi.mock("../auth", () => ({
  requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }),
  requireAuth: async () => ({ auth: { mode: "demo", ctx: {} } }),
  storeError: (e: unknown) => new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 400 }),
}));
vi.mock("../store", () => ({
  verifyAssessmentWorkspace: async () => undefined,
  getAssessmentLocal: (...a: unknown[]) => getAssessmentLocal(...a),
  listEvidenceLocal: (...a: unknown[]) => listEvidenceLocal(...a),
  updateAssessmentContextLocal: (...a: unknown[]) => updateContext(...a),
}));

import { POST } from "../../app/api/reports/photo-choices/route";
import { buildReportPhotos, unansweredPhotos, type SavedPhotoReview } from "../reportPhotos";

const call = (body: unknown) => POST(new Request("http://x/api/reports/photo-choices", { method: "POST", body: JSON.stringify(body) }));
const ev = (id: string, mime = "image/jpeg", at = "2026-01-01") => ({ id, assessmentId: "job-1", itemId: null, storageKey: `evidence/job-1/${id}`, mimeType: mime, sizeBytes: 1, uploadedAt: at });

beforeEach(() => {
  getAssessmentLocal.mockReset();
  listEvidenceLocal.mockReset();
  updateContext.mockReset();
  getAssessmentLocal.mockResolvedValue({ id: "job-1", context: { photoChoices: { e0: true } } });
  listEvidenceLocal.mockResolvedValue({ items: [ev("e0"), ev("e1"), ev("e2"), ev("v1", "audio/mp4")], persisted: true });
  updateContext.mockResolvedValue(true);
});

describe("POST /api/reports/photo-choices", () => {
  it("saves the answers next to the earlier ones", async () => {
    const res = await call({ assessmentId: "job-1", choices: { e1: true, e2: false } });
    expect(res.status).toBe(200);
    expect(updateContext.mock.calls[0][1].context.photoChoices).toEqual({ e0: true, e1: true, e2: false });
  });

  it("ignores photos that are not this job's images, and refuses when nothing is left", async () => {
    const ok = await call({ assessmentId: "job-1", choices: { e1: true, "someone-elses": true, v1: true } });
    expect(((await ok.json()) as { saved: number }).saved).toBe(1);
    expect(updateContext.mock.calls[0][1].context.photoChoices).not.toHaveProperty("someone-elses");
    expect(updateContext.mock.calls[0][1].context.photoChoices).not.toHaveProperty("v1");
    updateContext.mockClear();
    expect((await call({ assessmentId: "job-1", choices: { "someone-elses": true } })).status).toBe(400);
    expect(updateContext).not.toHaveBeenCalled();
  });

  it("only accepts yes/no answers", async () => {
    expect((await call({ assessmentId: "job-1", choices: { e1: "maybe" } })).status).toBe(400);
    expect((await call({ assessmentId: "job-1", choices: {} })).status).toBe(400);
  });
});

describe("photos in a report are the ones the person said yes to", () => {
  const review = (id: string): SavedPhotoReview => ({ evidenceId: id, caption: "Caption " + id, observations: [], possibleIssues: [], cannotTell: [], itemId: null, at: "t" });
  const evidence = ["e0", "e1", "e2"].map((id, i) => ev(id, "image/jpeg", "2026-01-0" + (i + 1)));

  it("lists the looked-at photos that have no answer yet", () => {
    const r = { e0: review("e0"), e1: review("e1") };
    expect(unansweredPhotos(evidence, r, { e0: true })).toEqual(["e1"]);
    expect(unansweredPhotos(evidence, r, { e0: false, e1: true })).toEqual([]);
    expect(unansweredPhotos(evidence, undefined, undefined)).toEqual([]);
  });

  it("builds the report photos from yes answers only: no answer and 'leave out' stay out", async () => {
    const r = { e0: review("e0"), e1: review("e1"), e2: review("e2") };
    // No service role in tests: the picture is missing but the text of chosen photos is kept.
    const photos = await buildReportPhotos("job-1", evidence, r, new Map(), { e0: true, e1: false });
    expect(photos.map((p) => p.evidenceId)).toEqual(["e0"]);
    expect(await buildReportPhotos("job-1", evidence, r, new Map(), {})).toEqual([]);
    expect(await buildReportPhotos("job-1", evidence, r, new Map(), undefined)).toEqual([]);
  });
});
