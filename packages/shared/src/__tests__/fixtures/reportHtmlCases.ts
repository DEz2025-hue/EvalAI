// Sample reports used to prove that a report with no office template is unchanged (reportHtmlGolden.json holds the HTML the builder
// produced for each of them before office templates existed, D-031).
import type { ReportInput, ReportSnapshot } from "../../report";

const snap = { id: "snap_g", assessmentId: "a1", assessmentVersion: 2, checklistVersion: "v1", materialsVersion: 3, createdAt: "2026-11-01T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true } as ReportSnapshot;
const fin = { ...snap, finalized: true, reviewedAt: "2026-11-02T00:00:00.000Z", reviewedByLabel: "A. Reviewer", reviewNote: "Looks right" } as ReportSnapshot;

export const baseInput: ReportInput = {
  siteName: "Hillside School <b>",
  mode: "assessment",
  pack: "solar",
  context: { goal: "Quote a rooftop array", scenario: "new_install" },
  checklist: [
    { title: "Roof / structure", status: "pass", notes: "Good", category: "Site", required: true, evidenceCount: 2 },
    { title: "Shading", status: "needs_attention", notes: "Tree NW", category: "Site", required: true, evidenceCount: 1 },
    { title: "Earthing", status: "fail", notes: "Missing strap", category: "Electrical", required: true },
    { title: "Load audit", status: "not_checked", category: "Customer", required: true },
    { title: "Roof area", status: "pass", category: "Measurements", required: true, measured: { value: 42.5, unit: "m²" } },
  ],
  siteBrief: { goal: "Quote a rooftop array", address: "1 Main Rd", intakeText: "Tin roof", answers: [{ question: "Access?", answer: "Ladder" }] },
  findings: [{ title: "Missing earth strap", severity: "high", description: "None seen", status: "confirmed", evidenceCount: 1 } as never],
  measurements: [{ name: "Roof area", value: 42.5, unit: "m²" }],
  materials: [{ description: "Panels", quantity: 12, unit: "pcs", rationale: "5 kW wanted", provisional: true }],
  quotation: { supplier: "ACME", total: 1000, currency: "AUD" },
  limitations: ["Load audit not checked"],
  photos: [{ evidenceId: "ev-1", caption: "A tree", itemTitle: "Shading", observations: ["Tall"], possibleIssues: [{ text: "May touch roof", confidence: "low" }], cannotTell: ["Underside"] }],
};

export const findingsNarrative = {
  summary: "Summary text.",
  siteOverview: "A school hall.",
  recommendations: "Do more.",
  openItems: "Load audit pending.",
  keyFindings: [{ id: "f1", title: "Tree shading", priority: "medium", observed: "Tree (Photo 1).", meaning: "Shade lowers output.", action: "Assess shading.", basis: [{ kind: "item", ref: "Shading" }, { kind: "photo", ref: "ev-1" }], source: "ai" }],
} as never;

export const REPORT_HTML_CASES: Record<string, [ReportSnapshot, ReportInput]> = {
  findings: [snap, { ...baseInput, narrative: findingsNarrative }],
  findingsFinal: [fin, { ...baseInput, narrative: { ...(findingsNarrative as object), notes: "Reviewer note" } as never }],
  legacy: [snap, { ...baseInput, narrative: { summary: "Old summary", observations: "Seen things", issues: "Some issues", recommendations: "Next steps", openItems: "Open" } }],
  empty: [snap, { siteName: "Empty", mode: "inspection", pack: "cctv", context: {}, checklist: [], findings: [], measurements: [], limitations: [] }],
};
