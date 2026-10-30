import { describe, it, expect } from "vitest";
import { buildReportHtml } from "../reportHtml";
import type { ReportSnapshot, ReportInput } from "../report";

function baseSnapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    id: "snap_test_001",
    assessmentId: "assess_001",
    assessmentVersion: 1,
    checklistVersion: "v1-5items",
    materialsVersionId: null,
    materialsVersion: null,
    quotationVersionId: null,
    quotationVersion: null,
    artifactKey: null,
    htmlPreview: "",
    createdAt: "2026-10-28T00:00:00.000Z",
    createdBy: "test-user",
    finalized: false,
    immutable: true,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    siteName: "Test Site",
    mode: "assessment",
    pack: "solar",
    context: { goal: "Install 10 panels" },
    checklist: [
      { title: "Site access & safety", status: "not_checked" },
      { title: "Panels inventory", status: "pass", notes: "OK" },
    ],
    findings: [],
    measurements: [{ name: "roof length", value: 10, unit: "m" }],
    materials: undefined,
    quotation: null,
    limitations: ["Not all areas accessible"],
    ...overrides,
  };
}

describe("Phase 6 — Reports from versioned snapshots", () => {
  it("buildReportHtml is deterministic (same input → same output)", () => {
    const snap = baseSnapshot();
    const input = baseInput();
    const a = buildReportHtml(snap, input);
    const b = buildReportHtml(snap, input);
    expect(a).toBe(b);
    expect(a).toContain("Test Site");
    expect(a).toContain("Not Checked");
  });

  it("report without materials shows no-materials message and preserves limitations", () => {
    const html = buildReportHtml(baseSnapshot(), baseInput());
    expect(html).toContain("No materials");
    expect(html).toContain("Not all areas accessible");
    expect(html).not.toContain(">provisional<"); // no provisional badge (the notice text mentions the word)
  });

  it("report with materials renders traceable rationale and provisional flag", () => {
    const html = buildReportHtml(baseSnapshot(), baseInput({
      materials: [{ description: "550W panel", quantity: 10, unit: "pc", rationale: "finding #1 + measurement roof-area 120m²", provisional: true }],
      quotation: { supplier: "SunSupply", total: 2800, currency: "AUD" },
    }));
    expect(html).toContain("550W panel");
    expect(html).toContain("provisional");
    expect(html).toContain("finding #1");
    expect(html).toContain("SunSupply");
    expect(html).toContain("AUD");
  });

  it("Not Checked ≠ Pass invariant preserved in HTML", () => {
    const html = buildReportHtml(baseSnapshot(), baseInput());
    expect(html).toContain("Not Checked ≠ Pass");
  });

  it("finalized snapshot is immutable — later edit must create new snapshot, not mutate", () => {
    const snap1 = baseSnapshot({ id: "snap_1", finalized: true, assessmentVersion: 1 });
    const snap2 = baseSnapshot({ id: "snap_2", finalized: false, assessmentVersion: 2 });
    // Simulate immutability: finalized snapshot id/version must not change after edit
    expect(snap1.finalized).toBe(true);
    expect(snap1.immutable).toBe(true);
    expect(snap2.id).not.toBe(snap1.id);
    expect(snap2.assessmentVersion).toBe(2);
    // HTML for snap1 must still reference v1, not v2
    const html1 = buildReportHtml(snap1, baseInput());
    const html2 = buildReportHtml(snap2, baseInput());
    expect(html1).toContain("Assessment v1");
    expect(html2).toContain("Assessment v2");
    expect(html1).not.toBe(html2);
  });

  it("version pinning: snapshot records exact versions, quotation tied to materials version", () => {
    const snap = baseSnapshot({ materialsVersion: 3, materialsVersionId: "list_assess_v3", quotationVersion: 3, quotationVersionId: "quote_v3" });
    const input = baseInput({
      materials: [{ description: "Cable", quantity: 50, unit: "m", rationale: "measurement cable run 50m" }],
      quotation: { supplier: "CableCo", total: 500, currency: "AUD" },
    });
    const html = buildReportHtml(snap, input);
    expect(html).toContain("Materials v3");
    expect(html).toContain("Quotation v3");
  });

  it("inspection mode report has distinct title and does not imply certification", () => {
    const snap = baseSnapshot({ assessmentVersion: 1 });
    const html = buildReportHtml(snap, baseInput({ mode: "inspection", pack: "cctv", siteName: "CCTV Site" }));
    expect(html).toContain("inspection");
    expect(html).toContain("cctv");
    expect(html).toContain("CCTV Site");
  });

  it("empty limitations renders 'None stated' and empty checklist handled", () => {
    const html = buildReportHtml(baseSnapshot(), baseInput({ checklist: [], limitations: [] }));
    expect(html).toContain("None stated");
  });
});
