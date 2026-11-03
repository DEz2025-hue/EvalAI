import { describe, it, expect, vi, afterEach } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { REPORT_DISCLAIMER, SECTION_IDS, type ReportInput, type ReportSnapshot, type ReportTemplate } from "@eval-ai/shared";
import { buildReportPdf } from "../pdf";

const snap: ReportSnapshot = { id: "snap_t", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-02T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };
const base: ReportInput = {
  siteName: "Hillside School", mode: "assessment", pack: "solar", context: { goal: "g" },
  checklist: [{ title: "Roof", status: "pass" }], findings: [], measurements: [{ name: "Roof area", value: 42, unit: "m2" }], limitations: ["Load audit not checked"],
  materials: [{ description: "Panels", quantity: 12, unit: "pcs", rationale: "5 kW wanted" }],
  narrative: { summary: "A short summary.", openItems: "Pending." },
};
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

type Drawn = { text: string; color?: unknown };
async function render(template?: ReportTemplate, over: Partial<ReportInput> = {}) {
  const drawn: Drawn[] = [];
  const orig = PDFPage.prototype.drawText;
  const spy = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text: string, o?: { color?: unknown }) {
    drawn.push({ text, color: o?.color });
    return orig.call(this, text, o as never);
  });
  const bytes = await buildReportPdf(snap, { ...base, ...over, ...(template ? { template } : {}) });
  spy.mockRestore();
  return { bytes, drawn, texts: drawn.map((d) => d.text) };
}
const idx = (texts: string[], s: string) => texts.findIndex((t) => t.includes(s));
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PDF with an office template", () => {
  it("with no template: today's order and headings", async () => {
    const { texts } = await render();
    const at = ["Executive summary", "Site and scope", "Key findings", "Materials - traceable", "Open items, limitations", "Appendix A - Checklist results", "Appendix B - Measurements", "Review and sign-off", "Important notice"].map((h) => idx(texts, h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(texts[0]).toMatch(/^EvalAI - assessment report/);
  });

  it("reorders, hides and renames", async () => {
    const order = SECTION_IDS.filter((i) => i !== "materials");
    const { texts } = await render({ sections: [{ id: "materials", visible: true, title: "Bill of materials" }, ...order.map((id) => ({ id, visible: id !== "appendixMeasurements" }))] });
    expect(idx(texts, "Bill of materials")).toBeLessThan(idx(texts, "Executive summary"));
    expect(idx(texts, "Appendix B")).toBe(-1);
  });

  it("prints the office name, header text and footer text", async () => {
    const { texts } = await render({ officeName: "Bright Energy", headerText: "Licence 1234", footerText: "Bright Energy, 1 Main St", sections: [] });
    expect(texts[0]).toMatch(/^Bright Energy - assessment report/);
    expect(texts.some((t) => t === "Licence 1234")).toBe(true);
    expect(texts.filter((t) => t === "Bright Energy, 1 Main St").length).toBeGreaterThanOrEqual(1);
  });

  it("uses the accent colour for headings only when one is set", async () => {
    const plain = await render();
    const styled = await render({ accentColor: "#b91c1c", sections: [] });
    const red = (d: Drawn) => JSON.stringify(d.color).includes("0.725");
    expect(plain.drawn.some(red)).toBe(false);
    expect(styled.drawn.find((d) => d.text === "Key findings")).toBeDefined();
    expect(red(styled.drawn.find((d) => d.text === "Key findings")!)).toBe(true);
  });

  it("embeds a PNG logo and still produces a valid PDF", async () => {
    const { bytes } = await render({ logo: PNG, sections: [] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("a logo that cannot be read is left out, not fatal", async () => {
    const { bytes } = await render({ logo: "data:image/png;base64,AAAA", sections: [] } as ReportTemplate);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("never drops the review status, the sign-off or the notice, even when every section is hidden", async () => {
    const hidden: ReportTemplate = { sections: SECTION_IDS.map((id) => ({ id, visible: false })) };
    const draft = await render(hidden);
    expect(idx(draft.texts, "DRAFT - not yet reviewed")).toBeGreaterThan(-1);
    expect(draft.texts.some((t) => REPORT_DISCLAIMER.startsWith(t.slice(0, 30)))).toBe(true);
    expect(idx(draft.texts, "Executive summary")).toBe(-1);
  });
});
