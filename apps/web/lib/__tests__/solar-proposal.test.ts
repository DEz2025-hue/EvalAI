import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ReportInput, ReportSnapshot, SolarDesign } from "@eval-ai/shared";

// Solar design and sizing proposals (D-036): plan, then the app's sizing, then the write-up; and the PDF prints it.

const draftSolarPlan = vi.fn();
const draftSolarWrite = vi.fn();
const draftReportNarrative = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return {
    ...real,
    draftSolarPlan: (...a: unknown[]) => draftSolarPlan(...a),
    draftSolarWrite: (...a: unknown[]) => draftSolarWrite(...a),
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

const payload: ReportInput = { siteName: "Palm Road house", mode: "assessment", pack: "solar", context: { scenario: "new_install" }, checklist: [{ title: "Load audit — demand & operating hours", status: "pass", category: "Customer" }], findings: [], measurements: [], limitations: [] };
const sv = (value: number) => ({ value, basis: "assumption", note: "" });
const plan = {
  basis: [{ item: "System type", decision: "Hybrid for backup", basis: "client" }],
  loads: [
    { name: "Split AC", quantity: 2, watts: 1000, hoursPerDay: 6, source: "label", motor: true, note: "" },
    { name: "Fridge", quantity: 1, watts: 150, hoursPerDay: 24, source: "typical", motor: true, note: "" },
  ],
  inputs: { systemType: "hybrid", peakSunHours: sv(5), systemLosses: sv(0.25), panelWatts: sv(550), batteryVoltage: sv(48), depthOfDischarge: sv(0.8), autonomyDays: sv(1), simultaneity: sv(0.7) },
  placement: ["Right-hand slope"],
};
const facts = (pack: string, scenario: string) => ({ assessment: { siteName: "Palm Road house", mode: "assessment", pack, context: {} }, scenario, items: [], responses: [], evidenceIds: [] });

beforeEach(() => {
  for (const m of [draftSolarPlan, draftSolarWrite, draftReportNarrative, loadFacts, getSnapshotLocal]) m.mockReset();
  draftSolarPlan.mockResolvedValue({ plan, requiresHumanReview: true });
  draftSolarWrite.mockResolvedValue({ summary: "S", siteOverview: "O", rest: { options: [{ area: "Battery", gap: "Essentials only", option: "Smaller battery" }], equipment: [], installation: ["Survey"], openItems: [{ item: "Sun hours", status: "To be confirmed" }], nextSteps: ["Confirm"] }, missingInformation: [], assumptions: [], unverifiedFigures: [], requiresHumanReview: true });
  getSnapshotLocal.mockResolvedValue({ id: "snap-1", assessmentId: "job-1", finalized: false, payload });
  loadFacts.mockResolvedValue(facts("solar", "new_install"));
});

describe("POST /api/ai/report-draft for a new solar installation", () => {
  it("step 1 drafts the loads and inputs (not key findings) and says to continue", async () => {
    const out = await (await call({ assessmentId: "job-1", snapshotId: "snap-1" })).json();
    expect(draftReportNarrative).not.toHaveBeenCalled();
    expect(out).toMatchObject({ keyFindings: [], continueWith: "designWrite" });
    expect(out.solar.loads).toHaveLength(2);
    expect(out.solar.inputs.systemType).toBe("hybrid");
  });

  it("step 2 gives the model the app's sizing in readable units and keeps the loads exactly as sent", async () => {
    const edited = { ...plan, loads: [plan.loads[0]] };
    const out = await (await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "designWrite", solar: edited })).json();
    const [, sentPlan, sizing] = draftSolarWrite.mock.calls[0];
    expect(sentPlan.loads).toHaveLength(1);
    // 2 x 1000 W x 6 h = 12 kWh/day; 12000 / (5 x 0.75) = 3200 Wp -> 6 panels of 550 W = 3.3 kWp
    expect(sizing).toMatchObject({ dailyEnergy: "12 kWh per day", array: "6 panels of 550 W, 3.3 kWp" });
    expect(sizing.battery).toMatch(/kWh at 48 V/);
    expect(out).toMatchObject({ summary: "S", siteOverview: "O" });
    expect(out.solar.loads).toHaveLength(1);
    expect(out.solar.openItems).toEqual([{ item: "Sun hours", status: "To be confirmed" }]);
  });

  it("step 2 with no loads anywhere says to draft first", async () => {
    const res = await call({ assessmentId: "job-1", snapshotId: "snap-1", stage: "designWrite" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Draft the design first/);
  });

  it("an existing solar system still gets the findings write-up", async () => {
    loadFacts.mockResolvedValue(facts("solar", "existing"));
    draftReportNarrative.mockResolvedValue({ summary: "S", siteOverview: "O", keyFindings: [], droppedFindings: [], openItems: "", missingInformation: [], assumptions: [], unverifiedFigures: [], requiresHumanReview: true });
    await call({ assessmentId: "job-1", snapshotId: "snap-1" });
    expect(draftSolarPlan).not.toHaveBeenCalled();
    expect(draftReportNarrative).toHaveBeenCalled();
  });

  it("a plan with no usable loads is an error, not an empty report", async () => {
    draftSolarPlan.mockResolvedValue({ plan: { ...plan, loads: [{ name: "Thing", watts: 0 }] }, requiresHumanReview: true });
    expect((await call({ assessmentId: "job-1", snapshotId: "snap-1" })).status).toBe(502);
  });
});

describe("solar proposal PDF", () => {
  it("prints the design and is longer than the same report without it", async () => {
    const snap: ReportSnapshot = { id: "snap_solar", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };
    const solar = { ...plan, options: [], equipment: [{ item: "Rails", quantity: "-", specification: "" }], installation: ["Survey"], openItems: [{ item: "Sun hours", status: "To be confirmed" }], nextSteps: ["Confirm"] } as unknown as SolarDesign;
    const withDesign = await PDFDocument.load(await buildReportPdf(snap, { ...payload, narrative: { summary: "A hybrid system.", solar } }));
    const without = await PDFDocument.load(await buildReportPdf(snap, payload));
    expect(withDesign.getPageCount()).toBeGreaterThanOrEqual(without.getPageCount());
    expect((await buildReportPdf(snap, { ...payload, narrative: { solar } })).byteLength).toBeGreaterThan((await buildReportPdf(snap, payload)).byteLength);
  });
});
