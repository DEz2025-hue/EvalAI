import { describe, it, expect } from "vitest";
import { buildReportHtml, safeImageSrc } from "../reportHtml";
import type { ReportInput, ReportPhoto, ReportSnapshot } from "../report";

// Photos in a report (D-022): described and flagged by an AI, always shown as unverified, never counted as findings.
const snap = { id: "s1", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-01T00:00:00Z", createdBy: "u", finalized: false, immutable: true } as unknown as ReportSnapshot;
const THUMB = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const photo = (over: Partial<ReportPhoto> = {}): ReportPhoto => ({
  evidenceId: "e1",
  caption: "A wall-mounted inverter with a red light.",
  itemTitle: "Inverter / charge controller — make, model, status",
  observations: ["Inverter mounted on a wall"],
  possibleIssues: [{ text: "The red light may be a fault indicator.", confidence: "medium" }],
  cannotTell: ["The error code is not readable"],
  thumbnail: THUMB,
  ...over,
});
const input = (photos?: ReportPhoto[]): ReportInput => ({ siteName: "Test Site", mode: "assessment", pack: "solar", context: {}, checklist: [], findings: [], measurements: [], limitations: [], photos });

describe("photos in the report HTML", () => {
  it("shows each photo with its caption, item, observations and what cannot be told, labelled as an unverified AI description", () => {
    const html = buildReportHtml(snap, input([photo()]));
    expect(html).toContain("Photos and what was seen");
    expect(html).toContain(`<img src="${THUMB}"`);
    expect(html).toContain("A wall-mounted inverter with a red light.");
    expect(html).toContain("Inverter / charge controller");
    expect(html).toContain("Inverter mounted on a wall");
    expect(html).toContain("The error code is not readable");
    expect(html).toContain("AI description, not verified");
  });

  it("lists possible issues in their own unverified section, separate from the findings", () => {
    const html = buildReportHtml(snap, input([photo()]));
    const issues = html.indexOf("Possible issues seen in photos (AI, not verified)");
    expect(issues).toBeGreaterThan(-1);
    expect(html).toContain("not confirmed findings");
    expect(html).toContain("The red light may be a fault indicator.");
    expect(html.indexOf("The red light may be a fault indicator.")).toBeGreaterThan(issues);
    // The key findings section does not contain the photo issue.
    const findingsStart = html.indexOf("<h2>Key findings</h2>");
    const findingsEnd = html.indexOf("</section>", findingsStart);
    expect(findingsStart).toBeGreaterThan(-1);
    expect(html.slice(findingsStart, findingsEnd)).not.toContain("red light");
    expect(html.slice(findingsStart, findingsEnd)).toContain("No findings, issues or items needing attention were recorded");
  });

  it("numbers the photos and refers to them from the issues", () => {
    const html = buildReportHtml(snap, input([photo(), photo({ evidenceId: "e2", caption: "A roof.", possibleIssues: [{ text: "Moss near the edge.", confidence: "low" }] })]));
    expect(html).toContain("Photo 1");
    expect(html).toContain("Photo 2");
    expect(html).toMatch(/Moss near the edge\.[\s\S]*Photo 2, unclear/);
  });

  it("has no photo sections when there are no photos, or no issues", () => {
    expect(buildReportHtml(snap, input())).not.toContain("Photos and what was seen");
    expect(buildReportHtml(snap, input([]))).not.toContain("Possible issues seen in photos");
    const noIssues = buildReportHtml(snap, input([photo({ possibleIssues: [] })]));
    expect(noIssues).toContain("Photos and what was seen");
    expect(noIssues).not.toContain("Possible issues seen in photos");
  });

  it("is deterministic", () => {
    const i = input([photo()]);
    expect(buildReportHtml(snap, i)).toBe(buildReportHtml(snap, i));
  });

  it("cannot be used to inject markup through text or the picture source", () => {
    const evil = photo({ caption: '<script>alert(1)</script>', observations: ['"><img src=x onerror=alert(1)>'], thumbnail: 'data:image/jpeg;base64,AAAA" onerror="alert(1)' });
    const html = buildReportHtml(snap, input([evil]));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('"><img src=x');
    expect(html).not.toContain("onerror=\"alert(1)");
    expect(html).not.toMatch(/<img src="data:image\/jpeg;base64,AAAA"/); // the bad source was dropped, no image at all
  });
});

describe("safeImageSrc", () => {
  it("accepts only a JPEG data URI of base64 characters", () => {
    expect(safeImageSrc(THUMB)).toBe(THUMB);
    for (const bad of ["", undefined, 5, "https://example.com/a.jpg", "javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,AA AA", 'data:image/jpeg;base64,AAAA"x']) expect(safeImageSrc(bad)).toBe("");
  });
});
