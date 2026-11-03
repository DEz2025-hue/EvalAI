import { describe, it, expect, vi, beforeEach } from "vitest";

const draftReportNarrative = vi.fn();
const draftReportSummary = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, draftReportNarrative: (...a: unknown[]) => draftReportNarrative(...a), draftReportSummary: (...a: unknown[]) => draftReportSummary(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, aiRunHook: () => undefined, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});
const getSnapshotLocal = vi.fn();
const buildInput = vi.fn();
const listFindingsLocal = vi.fn();
vi.mock("../store", () => ({
  getSnapshotLocal: (...a: unknown[]) => getSnapshotLocal(...a),
  buildReportInputFromStoredFacts: (...a: unknown[]) => buildInput(...a),
  listEvidenceLocal: async () => ({ items: [{ id: "ev-1", itemId: "item-1", mimeType: "image/jpeg", uploadedAt: "2026-11-01" }] }),
  listFindingsLocal: (...a: unknown[]) => listFindingsLocal(...a),
}));
const buildReportPhotos = vi.fn();
vi.mock("../reportPhotos", () => ({ buildReportPhotos: (...a: unknown[]) => buildReportPhotos(...a) }));

import { POST } from "../../app/api/ai/report-draft/route";

const call = (body: unknown) => POST(new Request("http://x/api/ai/report-draft", { method: "POST", body: JSON.stringify(body) }));

const payload = {
  siteName: "Hillside School",
  mode: "assessment" as const,
  pack: "solar" as const,
  context: { goal: "Quote an array" },
  siteBrief: { goal: "Quote an array", intakeText: "Tin roof" },
  checklist: [
    { title: "Roof", status: "needs_attention", notes: "Rust at the edge", category: "Site", required: true, evidenceCount: 1 },
    { title: "Load audit", status: "not_checked", category: "Customer", required: true },
    { title: "Batteries", status: "pass", category: "System", required: false, measured: { value: 48, unit: "V" } },
  ],
  findings: [{ title: "Rust", severity: "low", description: "Surface rust", uncertainty: "Depth unknown", evidenceCount: 1, status: "confirmed" }],
  measurements: [{ name: "Roof area", value: 40, unit: "m²" }],
  limitations: ["Load audit: not checked yet (required)"],
  photos: [{ evidenceId: "ev-1", caption: "A rusty edge", itemTitle: "Roof", observations: ["Rust"], possibleIssues: [{ text: "May be structural", confidence: "low" as const }], cannotTell: ["Underside"] }],
  materials: [{ description: "Rail", quantity: 4, unit: "ea", rationale: "Two per plane", provisional: true }],
  narrative: { summary: "an old summary", keyFindings: [{ id: "f1", title: "Edited by the person", priority: "high", observed: "Rust at the roof edge (Photo 1).", meaning: "Corrosion can spread.", action: "Have it assessed.", basis: [{ kind: "item", ref: "Roof" }], source: "person" }] },
};

const aiOut = {
  summary: "S",
  siteOverview: "O",
  keyFindings: [{ title: "Edge corrosion", priority: "medium", observed: "Rust at the edge (Photo 1).", meaning: "Corrosion can spread.", action: "Have it assessed.", basis: [{ kind: "photo", ref: "ev-1" }] }],
  droppedFindings: ["Invented concern"],
  openItems: "P",
  missingInformation: [],
  assumptions: [],
  unverifiedFigures: [],
  requiresHumanReview: true,
};

beforeEach(() => {
  for (const m of [draftReportNarrative, draftReportSummary, loadFacts, getSnapshotLocal, buildInput, listFindingsLocal, buildReportPhotos]) m.mockReset();
  draftReportNarrative.mockResolvedValue(aiOut);
  draftReportSummary.mockResolvedValue({ summary: "New summary", openItems: "New open items", unverifiedFigures: [], requiresHumanReview: true });
  loadFacts.mockResolvedValue({
    assessment: { siteName: "Hillside School", mode: "assessment", pack: "solar", context: { photoReview: { "ev-1": {} }, photoChoices: { "ev-1": true, "ev-2": false } } },
    // An existing system: a new solar installation gets the design proposal instead (D-036, tested in solar-proposal.test.ts).
    scenario: "existing",
    items: [{ id: "item-1", title: "Roof", instructions: "Look at the roof surface." }],
    responses: [],
    evidenceIds: ["ev-1"],
  });
  listFindingsLocal.mockResolvedValue([{ status: "confirmed" }, { status: "needs_review", title: "SECRET UNCONFIRMED TEXT" }, { status: "needs_review", title: "ANOTHER" }]);
  buildInput.mockResolvedValue({ input: { ...payload, photos: undefined, narrative: undefined } });
  buildReportPhotos.mockResolvedValue([]);
});

describe("POST /api/ai/report-draft (analyze)", () => {
  it("writes from the draft's own saved report content, with counts, site brief, guidance and numbered photo notes", async () => {
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
    const res = await call({ assessmentId: "job-1", snapshotId: "snap-1" });
    expect(res.status).toBe(200);
    expect(buildInput).not.toHaveBeenCalled();
    const sent = draftReportNarrative.mock.calls[0][0];
    expect(sent.siteBrief).toMatchObject({ intakeText: "Tin roof" });
    expect(sent.glance).toEqual({ total: 3, checked: 2, pass: 1, issue: 0, needsAttention: 1, notApplicable: 0, notChecked: 1, requiredNotChecked: 1 });
    expect(sent.limitations).toEqual(["Load audit: not checked yet (required)"]);
    expect(sent.checklist[0]).toMatchObject({ title: "Roof", category: "Site", required: true, evidenceCount: 1, covers: "Look at the roof surface." });
    expect(sent.checklist[2].measured).toEqual({ value: 48, unit: "V" });
    expect(sent.materials).toHaveLength(1);
    expect(sent.photos).toEqual([{ id: "ev-1", itemTitle: "Roof", caption: "A rusty edge", observations: ["Rust"], possibleIssues: ["May be structural"], cannotTell: ["Underside"] }]);
    expect(sent.scenario).toBe("existing");
  });

  it("returns the findings with ids, marked as AI drafts, plus the summary, overview, open items and what was left out", async () => {
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
    const out = await (await call({ assessmentId: "job-1", snapshotId: "snap-1" })).json();
    expect(out).toMatchObject({ summary: "S", siteOverview: "O", openItems: "P", droppedFindings: ["Invented concern"], draft: true, stage: "analyze" });
    expect(out.keyFindings).toEqual([{ id: "f1", title: "Edge corrosion", priority: "medium", observed: "Rust at the edge (Photo 1).", meaning: "Corrosion can spread.", action: "Have it assessed.", basis: [{ kind: "photo", ref: "ev-1" }], source: "ai" }]);
  });

  it("only counts findings that await review; their content never reaches the model", async () => {
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
    await call({ assessmentId: "job-1", snapshotId: "snap-1" });
    const sent = draftReportNarrative.mock.calls[0][0];
    expect(sent.findingsAwaitingReview).toBe(2);
    expect(JSON.stringify(sent)).not.toContain("SECRET UNCONFIRMED TEXT");
    expect(sent.findings).toEqual([{ title: "Rust", severity: "low", description: "Surface rust", uncertainty: "Depth unknown" }]);
  });

  it("without a draft, builds the report input itself and uses only the photos the person chose, as notes (no pictures read)", async () => {
    buildReportPhotos.mockResolvedValue(payload.photos);
    const res = await call({ assessmentId: "job-1" });
    expect(res.status).toBe(200);
    expect(buildInput).toHaveBeenCalledTimes(1);
    const args = buildReportPhotos.mock.calls[0];
    expect(args[4]).toEqual({ "ev-1": true, "ev-2": false }); // the choices are applied
    expect(args[5]).toEqual({ thumbnails: false });
    expect(draftReportNarrative.mock.calls[0][0].photos).toHaveLength(1);
  });

  it("refuses a draft that belongs to another job, or one that is already finalized", async () => {
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "someone-elses-job", finalized: false, payload });
    expect((await call({ assessmentId: "job-1", snapshotId: "snap-1" })).status).toBe(404);
    getSnapshotLocal.mockResolvedValue(null);
    expect((await call({ assessmentId: "job-1", snapshotId: "gone" })).status).toBe(404);
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: true, payload });
    expect((await call({ assessmentId: "job-1", snapshotId: "snap-1" })).status).toBe(409);
    expect(draftReportNarrative).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/report-draft (summary)", () => {
  it("rewrites the summary and open items from the findings as the person saved them, and returns only those", async () => {
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
    const out = await (await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "summary" })).json();
    expect(draftReportNarrative).not.toHaveBeenCalled();
    const sent = draftReportSummary.mock.calls[0][0];
    expect(sent.keyFindings[0]).toEqual({ title: "Edited by the person", priority: "high", observed: "Rust at the roof edge (Photo 1).", meaning: "Corrosion can spread.", action: "Have it assessed." });
    expect(sent.findingsAwaitingReview).toBe(2);
    expect(out).toMatchObject({ summary: "New summary", openItems: "New open items", stage: "summary" });
    expect(out.keyFindings).toBeUndefined();
  });

  it("includes a confirmed finding that the written findings left out", async () => {
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
    await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "summary" });
    const titles = draftReportSummary.mock.calls[0][0].keyFindings.map((f: { title: string }) => f.title);
    expect(titles).toContain("Rust"); // the reviewed finding is never dropped
  });

  it("needs a draft", async () => {
    expect((await call({ assessmentId: "job-1", stage: "summary" })).status).toBe(400);
    expect(draftReportSummary).not.toHaveBeenCalled();
  });
});
