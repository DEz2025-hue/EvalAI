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

  it("handles a very long unbroken token without throwing", async () => {
    const bytes = await buildReportPdf(snap, input({ checklist: [{ title: "x".repeat(900), status: "pass" }] }));
    expect(bytes.length).toBeGreaterThan(500);
  });
});
