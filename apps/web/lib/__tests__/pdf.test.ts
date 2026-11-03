import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ReportInput, ReportSnapshot } from "@eval-ai/shared";
import { buildReportPdf } from "../pdf";

const snap: ReportSnapshot = {
  id: "snap_pdf", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-10-30T00:00:00.000Z", createdBy: "u", finalized: true, immutable: true,
};
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  siteName: "Site", mode: "assessment", pack: "solar", context: { goal: "g" },
  checklist: [{ title: "Roof", status: "pass" }], findings: [], measurements: [], limitations: [], ...over,
});

async function pageCount(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("PDF export", () => {
  it("does not crash on characters the standard font cannot encode", async () => {
    const bytes = await buildReportPdf(snap, input({
      siteName: "Ñandú — 太阳能 site ≠ simple",
      checklist: [{ title: "Area 12 m² → ok ✓", status: "pass", notes: "ü ß 日本語 😀" }],
      measurements: [{ name: "Roof ≤ 20°", value: 12.5, unit: "m²" }],
    }));
    expect(bytes.length).toBeGreaterThan(500);
    expect(await pageCount(bytes)).toBe(1);
  });

  it("paginates long reports instead of overprinting page one, with no silent truncation", async () => {
    const checklist = Array.from({ length: 80 }, (_, i) => ({ title: `Checklist item number ${i + 1}`, status: "pass", notes: "note ".repeat(30) }));
    const limitations = Array.from({ length: 25 }, (_, i) => `Limitation ${i + 1}: ` + "detail ".repeat(20));
    const bytes = await buildReportPdf(snap, input({ checklist, limitations }));
    expect(await pageCount(bytes)).toBeGreaterThan(2);
  });

  it("renders findings, materials and quotation without throwing", async () => {
    const bytes = await buildReportPdf(snap, input({
      findings: [{ title: "Cracked mount", severity: "high", description: "Corroded bracket", uncertainty: "hidden side", evidenceCount: 2, status: "confirmed" }],
      materials: [{ description: "Bracket", quantity: 4, unit: "pcs", rationale: "From finding F1", provisional: true }],
      quotation: { supplier: "Acme", total: 120.5, currency: "USD" },
    }));
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
  });

  it("renders the full report layout (written sections, site brief, grouped results, appendix) and paginates it", async () => {
    const paragraph = "The roof is sound and the array fits; the north-west tree shades the morning sun. ".repeat(12);
    const full = input({
      context: { goal: "Quote a rooftop array", scenario: "new_install" },
      siteBrief: { goal: "Quote a rooftop array", address: "12 Acacia Rd", existingEquipment: "None", constraints: "Ladder only", intakeText: "Tin roof, tree to the north-west", intakeVisible: ["Tin roof"], intakeLimits: ["Roof strength unknown"], answers: [{ question: "Access?", answer: "Ladder needed" }] },
      checklist: [
        { title: "Roof", status: "needs_attention", notes: "Rust at the edge", category: "Site", required: true, evidenceCount: 2 },
        { title: "Earthing", status: "fail", notes: "Earth strap missing", category: "Electrical", required: true },
        { title: "Load audit", status: "not_checked", category: "Customer", required: true },
        { title: "Measurements — roof area", status: "pass", category: "Measurements", measured: { value: 42.5, unit: "m²" } },
      ],
      limitations: ["Load audit: not checked yet (required)"],
      narrative: { summary: paragraph, siteOverview: paragraph, observations: paragraph.repeat(4), issues: paragraph, recommendations: paragraph, openItems: paragraph, notes: "Reviewed on site." },
    });
    const bytes = await buildReportPdf(snap, full);
    const bare = await buildReportPdf(snap, { ...full, narrative: undefined });
    expect(await pageCount(bytes)).toBeGreaterThan(await pageCount(bare)); // the written sections are on the pages
    expect(await pageCount(bare)).toBeGreaterThanOrEqual(1);
  });

  it("renders key findings with their photos, the recommended actions, and paginates a long set", async () => {
    // a 1x1 JPEG as a data URI
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const f = (i: number) => ({ id: `f${i}`, title: `Finding number ${i}`, priority: (["high", "medium", "low", "info"] as const)[i % 4], observed: "Observed text. ".repeat(20), meaning: "What it means. ".repeat(20), action: "Do this next. ".repeat(10), basis: [{ kind: "item" as const, ref: "Roof" }, { kind: "photo" as const, ref: "ev-1" }], source: "ai" as const });
    const many = input({
      photos: [{ evidenceId: "ev-1", caption: "A roof edge.", observations: ["Rust"], possibleIssues: [], cannotTell: [], thumbnail: jpeg }],
      narrative: { summary: "Summary. ".repeat(40), keyFindings: Array.from({ length: 12 }, (_, i) => f(i)) },
    });
    const bytes = await buildReportPdf(snap, many);
    expect(await pageCount(bytes)).toBeGreaterThan(3);
    const fewer = await buildReportPdf(snap, { ...many, narrative: { summary: "S", keyFindings: [f(0)] } });
    expect(await pageCount(fewer)).toBeLessThan(await pageCount(bytes));
  });

  it("renders a report with no written findings (built from what was recorded) and one saved before the new sections existed", async () => {
    const plain = input({ checklist: [{ title: "Earthing", status: "fail", notes: "Strap missing", category: "Electrical" }], findings: [{ title: "Cracked mount", severity: "high", description: "Corroded", evidenceCount: 2, status: "confirmed" }] });
    expect((await buildReportPdf(snap, plain)).length).toBeGreaterThan(500);
  });

  it("renders a report saved before the new sections existed", async () => {
    const old: ReportInput = { siteName: "Old", mode: "inspection", pack: "cctv", context: { goal: "g" }, checklist: [{ title: "Cameras", status: "needs_attention", notes: "Blurry" }], findings: [], measurements: [], limitations: ["Cameras — needs_attention"], narrative: { summary: "S", recommendations: "R", notes: "N" } };
    expect((await buildReportPdf(snap, old)).length).toBeGreaterThan(500);
  });

  it("handles a very long unbroken token without throwing", async () => {
    const bytes = await buildReportPdf(snap, input({ checklist: [{ title: "x".repeat(900), status: "pass" }] }));
    expect(bytes.length).toBeGreaterThan(500);
  });
});
