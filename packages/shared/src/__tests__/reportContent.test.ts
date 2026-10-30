import { describe, it, expect } from "vitest";
import { buildReportHtml, escapeHtml, safeNumber } from "../reportHtml";
import { REPORT_DISCLAIMER, type ReportInput, type ReportSnapshot } from "../report";

const snap: ReportSnapshot = {
  id: "snap_1", assessmentId: "a1", assessmentVersion: 2, checklistVersion: "v1", createdAt: "2026-10-30T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true,
};
const base: ReportInput = {
  siteName: "Site", mode: "assessment", pack: "solar", context: { goal: "g" },
  checklist: [{ title: "Roof", status: "pass" }], findings: [], measurements: [], limitations: [],
};

describe("report HTML safety", () => {
  it("escapes quotes as well as angle brackets and ampersands", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;");
  });

  it("coerces numeric fields so tampered payloads cannot inject markup", () => {
    expect(safeNumber("<script>alert(1)</script>")).toBe("—");
    expect(safeNumber(12.5)).toBe("12.5");
    const html = buildReportHtml(snap, { ...base, measurements: [{ name: "m", value: "<img src=x onerror=alert(1)>" as unknown as number, unit: "m" }] });
    expect(html).not.toContain("<img src=x");
  });

  it("escapes site name, notes and finding text", () => {
    const html = buildReportHtml(snap, {
      ...base,
      siteName: "<b>Evil</b>",
      checklist: [{ title: "T", status: "fail", notes: "<script>x</script>" }],
      findings: [{ title: "<i>F</i>", description: "<u>d</u>", status: "confirmed" }],
    });
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<i>F</i>");
  });
});

describe("report content requirements", () => {
  it("lists confirmed findings with uncertainty and linked-evidence count", () => {
    const html = buildReportHtml(snap, { ...base, findings: [{ title: "Cracked mount", severity: "high", description: "Corroded bracket", uncertainty: "hidden side not visible", evidenceCount: 3, status: "confirmed" }] });
    expect(html).toContain("Cracked mount");
    expect(html).toContain("Corroded bracket");
    expect(html).toContain("hidden side not visible");
    expect(html).toContain("Evidence linked: 3");
  });

  it("marks unconfirmed findings clearly", () => {
    const html = buildReportHtml(snap, { ...base, findings: [{ title: "Maybe", status: "needs_review" }] });
    expect(html).toContain("unconfirmed");
  });

  it("always includes the not-a-certification notice", () => {
    expect(buildReportHtml(snap, base)).toContain(escapeHtml(REPORT_DISCLAIMER));
    expect(REPORT_DISCLAIMER).toMatch(/not a certification/i);
  });

  it("shows limitations and uncertainty section", () => {
    const html = buildReportHtml(snap, { ...base, limitations: ["Roof not accessible"] });
    expect(html).toContain("Roof not accessible");
    expect(html).toContain("limitations & uncertainty");
  });
});
