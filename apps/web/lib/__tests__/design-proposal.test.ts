import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { DesignProposal, ReportInput, ReportSnapshot } from "@eval-ai/shared";

// Design proposals (D-034): a new CCTV installation is answered with a design instead of key findings, and the PDF prints it.

const draftDesignPlan = vi.fn();
const draftDesignWrite = vi.fn();
const draftReportNarrative = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return {
    ...real,
    draftDesignPlan: (...a: unknown[]) => draftDesignPlan(...a),
    draftDesignWrite: (...a: unknown[]) => draftDesignWrite(...a),
    draftReportNarrative: (...a: unknown[]) => draftReportNarrative(...a),
  };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, aiRunHook: () => undefined, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});
const getSnapshotLocal = vi.fn();
vi.mock("../store", () => ({
  getSnapshotLocal: (...a: unknown[]) => getSnapshotLocal(...a),
  buildReportInputFromStoredFacts: vi.fn(),
  listEvidenceLocal: async () => ({ items: [] }),
  listFindingsLocal: async () => [],
}));
vi.mock("../reportPhotos", () => ({ buildReportPhotos: async () => [] }));

import { POST } from "../../app/api/ai/report-draft/route";
import { buildReportPdf } from "../pdf";

const call = (body: unknown) => POST(new Request("http://x/api/ai/report-draft", { method: "POST", body: JSON.stringify(body) }));

const payload: ReportInput = {
  siteName: "Head office",
  mode: "assessment",
  pack: "cctv",
  context: { scenario: "new_install" },
  checklist: [{ title: "Entrances and gates", status: "pass", category: "Site" }],
  findings: [],
  measurements: [],
  limitations: [],
};

const aiPlan = {
  basis: [{ item: "Retention", decision: "30 days", basis: "client" }],
  approach: ["Every entrance is covered."],
  areas: [{ name: "Compound", cameras: [{ id: "x1", location: "Main gate", type: "ANPR", purpose: "Plates" }, { id: "X1", location: "Fence end", type: "bullet", purpose: "Fence" }], uncovered: [], notes: [] }],
};
const aiRest = { options: [{ area: "Compound", gap: "Side gate", option: "1 LPR camera", extraCameras: 1 }], equipment: [{ item: "Recorder", quantity: "1", specification: "8 channels" }], installation: ["Survey"], openItems: [{ item: "Gate positions", status: "To be confirmed" }], nextSteps: ["Confirm"] };

beforeEach(() => {
  for (const m of [draftDesignPlan, draftDesignWrite, draftReportNarrative, loadFacts, getSnapshotLocal]) m.mockReset();
  draftDesignPlan.mockResolvedValue({ plan: aiPlan, requiresHumanReview: true });
  draftDesignWrite.mockResolvedValue({ summary: "S", siteOverview: "O", rest: aiRest, missingInformation: [], assumptions: [], unverifiedFigures: [], requiresHumanReview: true });
  getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
});

const facts = (pack: string, scenario: string) => ({ assessment: { siteName: "Head office", mode: "assessment", pack, context: {} }, scenario, items: [], responses: [], evidenceIds: [] });

describe("POST /api/ai/report-draft for a new CCTV installation", () => {
  it("step 1 drafts the camera plan (not key findings), checked, and says to continue with the write-up", async () => {
    loadFacts.mockResolvedValue(facts("cctv", "new_install"));
    const res = await call({ assessmentId: "job-1", snapshotId: "snap-1" });
    expect(res.status).toBe(200);
    expect(draftReportNarrative).not.toHaveBeenCalled();
    expect(draftDesignWrite).not.toHaveBeenCalled();
    const out = await res.json();
    expect(out).toMatchObject({ keyFindings: [], continueWith: "designWrite", draft: true });
    expect(out.summary).toBeUndefined();
    // cleanDesign ran: camera types mapped, IDs upper-cased and made unique.
    expect(out.design.areas[0].cameras.map((c: { id: string; type: string }) => [c.id, c.type])).toEqual([["X1", "lpr"], ["X1'", "outdoor_bullet"]]);
  });

  it("step 2 writes around the plan it is given, keeping the plan exactly as sent", async () => {
    loadFacts.mockResolvedValue(facts("cctv", "new_install"));
    const edited = { ...aiPlan, areas: [{ name: "Yard", cameras: [{ id: "Y1", location: "Gate", type: "lpr", purpose: "Plates" }], uncovered: [], notes: [] }] };
    const res = await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "designWrite", design: edited });
    expect(res.status).toBe(200);
    expect(draftDesignWrite.mock.calls[0][1].areas[0].name).toBe("Yard");
    // The app's sizing (D-037) goes to the write-up with the plan.
    expect(draftDesignWrite.mock.calls[0][2]).toMatchObject({ cameras: 1, recorder: "4 channels" });
    expect(draftDesignWrite.mock.calls[0][2].camerasShortOfDetail).toEqual([]);
    const out = await res.json();
    expect(out).toMatchObject({ summary: "S", siteOverview: "O", keyFindings: [], draft: true });
    expect(out.design.areas.map((a: { name: string }) => a.name)).toEqual(["Yard"]);
    expect(out.design.options).toEqual([{ area: "Compound", gap: "Side gate", option: "1 LPR camera", extraCameras: 1 }]);
    expect(out.design.nextSteps).toEqual(["Confirm"]);
  });

  it("step 2 falls back to the draft's saved plan, and with no plan says to draft it first", async () => {
    loadFacts.mockResolvedValue(facts("cctv", "new_install"));
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload: { ...payload, narrative: { design: { ...aiPlan, ...aiRest } } } });
    expect((await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "designWrite" })).status).toBe(200);
    getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
    const res = await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "designWrite" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Draft the design first/);
  });

  it("an existing CCTV system still gets the findings write-up, and cannot ask for a design write-up", async () => {
    loadFacts.mockResolvedValue(facts("cctv", "existing"));
    draftReportNarrative.mockResolvedValue({ summary: "S", siteOverview: "O", keyFindings: [], droppedFindings: [], openItems: "", missingInformation: [], assumptions: [], unverifiedFigures: [], requiresHumanReview: true });
    await call({ assessmentId: "job-1", snapshotId: "snap-1" });
    expect(draftDesignPlan).not.toHaveBeenCalled();
    expect(draftReportNarrative).toHaveBeenCalled();
    expect((await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "designWrite", design: aiPlan })).status).toBe(400);
  });

  it("an unusable plan is an error, not an empty report", async () => {
    loadFacts.mockResolvedValue(facts("cctv", "new_install"));
    draftDesignPlan.mockResolvedValue({ plan: { basis: [], approach: [], areas: [] }, requiresHumanReview: true });
    expect((await call({ assessmentId: "job-1", snapshotId: "snap-1" })).status).toBe(502);
  });

  it("the summary-only rewrite is refused for a design, with a reason", async () => {
    loadFacts.mockResolvedValue(facts("cctv", "new_install"));
    const res = await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "summary" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/design/i);
  });
});

describe("design proposal PDF", () => {
  const snap: ReportSnapshot = { id: "snap_design", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };
  const area = (name: string, prefix: string, n: number) => ({
    name,
    cameras: Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, location: `${name} room ${i + 1}, north-west corner by the long corridor that leads to the back stairs`, type: "indoor_dome" as const, purpose: "Room and doors" })),
    uncovered: ["Staff office - ordinary office"],
    notes: ["Every stair landing is covered."],
  });
  const design: DesignProposal = {
    basis: [{ item: "Recording", decision: "Motion only, 30 days", basis: "client" }, { item: "Recorder", decision: "Server room", basis: "assumption" }],
    approach: ["Every entrance is covered."],
    areas: [area("Ground floor", "G", 21), area("First floor", "F", 11), area("Second floor", "S", 9), area("Compound", "X", 16)],
    options: [{ area: "Second floor", gap: "Finance office has no camera", option: "1 camera", extraCameras: 1 }],
    equipment: [{ item: "Network video recorder", quantity: "1", specification: "64 channels" }],
    installation: ["Survey", "Cabling"],
    openItems: [{ item: "Compound not measured", status: "Survey needed" }],
    nextSteps: ["Add supplier costs"],
  };

  it("prints a long design across pages without failing", async () => {
    const bytes = await buildReportPdf(snap, { ...payload, narrative: { summary: "A design.", design } });
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    const without = (await PDFDocument.load(await buildReportPdf(snap, payload))).getPageCount();
    expect(pages).toBeGreaterThan(without);
    expect(pages).toBeGreaterThanOrEqual(3);
  });
});
