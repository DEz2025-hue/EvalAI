import { describe, expect, it } from "vitest";
import { cleanHighlights, highlightGroups, highlightsFromBoxes } from "../photoHighlights";
import { buildReportHtml } from "../reportHtml";
import { previewKey } from "../reportGate";
import type { ReportInput, ReportPhoto, ReportSnapshot } from "../report";

const box = (x1: number, y1: number, x2: number, y2: number, c?: number) => ({ x1, y1, x2, y2, w: 1000, h: 500, ...(c !== undefined ? { c } : {}) });
const THUMB = "data:image/jpeg;base64,QUJD";
const photo = (over: Partial<ReportPhoto> = {}): ReportPhoto => ({ evidenceId: "ev1", caption: "A roof", observations: [], possibleIssues: [], cannotTell: [], thumbnail: THUMB, ...over });
const snapshot: ReportSnapshot = { id: "s1", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03", createdBy: "u", finalized: false, immutable: true };
const input = (photos: ReportPhoto[]): ReportInput => ({ siteName: "Test", mode: "assessment", pack: "solar", context: {}, checklist: [], findings: [], measurements: [], limitations: [], photos });

describe("highlightsFromBoxes", () => {
  it("gives shares of the picture, counting the inclusive corners", () => {
    expect(highlightsFromBoxes("Rust", [box(100, 50, 199, 149, 0.9)])).toEqual([{ label: "Rust", x: 0.1, y: 0.1, w: 0.1, h: 0.2, c: 0.9 }]);
  });

  it("drops unsure matches, matches with no confidence, specks and outlines that cover most of the picture", () => {
    expect(highlightsFromBoxes("Rust", [box(0, 0, 100, 100, 0.3), box(0, 0, 100, 100), box(0, 0, 999, 399, 0.99), box(1, 1, 5, 5, 0.99)])).toEqual([]);
  });

  it("keeps the most confident few", () => {
    const out = highlightsFromBoxes("Rust", [box(0, 0, 50, 50, 0.6), box(0, 0, 50, 50, 0.9), box(0, 0, 50, 50, 0.7)]);
    expect(out.map((h) => h.c)).toEqual([0.9, 0.7]);
  });
});

describe("cleanHighlights", () => {
  it("drops anything that is not an area inside the picture, and trims overflow", () => {
    expect(cleanHighlights([{ label: "a", x: "0;background:url(x)", y: 0, w: 1, h: 1 }, { label: "", x: 0, y: 0, w: 1, h: 1 }, { label: "b", x: 0, y: 0, w: 0, h: 1 }, { label: "c", x: 2, y: 0, w: 1, h: 1 }])).toEqual([]);
    expect(cleanHighlights([{ label: "d", x: 0.5, y: 0.5, w: 1, h: 0.25 }])).toEqual([{ label: "d", x: 0.5, y: 0.5, w: 0.5, h: 0.25 }]);
    expect(cleanHighlights("nonsense")).toEqual([]);
  });
});

describe("highlightGroups", () => {
  it("gives one letter per possible issue", () => {
    const groups = highlightGroups({ highlights: [{ label: "Rust", x: 0, y: 0, w: 0.1, h: 0.1 }, { label: "Palm", x: 0.2, y: 0, w: 0.1, h: 0.1 }, { label: "Rust", x: 0.5, y: 0, w: 0.1, h: 0.1 }] });
    expect(groups.map((g) => [g.letter, g.label, g.areas.length])).toEqual([["A", "Rust", 2], ["B", "Palm", 1]]);
  });
});

describe("the report", () => {
  const marked = photo({ highlights: [{ label: "<b>Rust</b>", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }] });

  it("draws the outline over the picture, with an escaped legend that says it is unverified", () => {
    const html = buildReportHtml(snapshot, input([marked]));
    expect(html).toContain("left:10.00%;top:20.00%;width:30.00%;height:40.00%");
    expect(html).toContain("&lt;b&gt;Rust&lt;/b&gt;");
    expect(html).not.toContain("<b>Rust</b>");
    expect(html).toContain("Not verified, not a finding and not a measurement");
  });

  it("cannot be used to put markup in the page through a stored number", () => {
    const html = buildReportHtml(snapshot, input([photo({ highlights: [{ label: "x", x: '1"><script>' as unknown as number, y: 0, w: 0.1, h: 0.1 }] })]));
    expect(html).not.toContain("<script>");
  });

  it("shows no outline or note on a photo without highlights, or with no picture to draw on", () => {
    expect(buildReportHtml(snapshot, input([photo()]))).not.toContain("Not verified, not a finding");
    expect(buildReportHtml(snapshot, input([{ ...marked, thumbnail: undefined }]))).not.toContain("Not verified, not a finding");
  });

  it("counts a removed mark as a new version to preview", () => {
    const a = previewKey({ id: "s", finalized: false, payload: { photos: [marked] } });
    const b = previewKey({ id: "s", finalized: false, payload: { photos: [{ ...marked, highlights: undefined }] } });
    expect(a).not.toBe(b);
  });
});
