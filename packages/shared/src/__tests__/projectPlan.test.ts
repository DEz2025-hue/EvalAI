import { describe, expect, it } from "vitest";
import { buildProjectPlan, cleanProjectPlan, hasWriteUp, projectPlanNote } from "../projectPlan";
import { buildReportHtml } from "../reportHtml";
import { previewKey } from "../reportGate";
import type { ReportInput, ReportSnapshot } from "../report";

const job = {
  pack: "solar" as const,
  mode: "assessment" as const,
  context: { scenario: "new_install" },
  checklist: [
    { title: "Earthing", status: "fail", notes: "None installed", required: true },
    { title: "Board cover", status: "needs_attention", required: false },
    { title: "Measurements", status: "not_applicable", notes: "No tape", required: true },
    { title: "Load audit", status: "not_checked", required: true },
    { title: "Roof", status: "pass", notes: "Fine", required: true },
    { title: "Optional extra", status: "not_checked", required: false },
  ],
};
const input: ReportInput = { ...job, siteName: "Test", findings: [], measurements: [], limitations: [] };
const snapshot: ReportSnapshot = { id: "s1", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-03", createdBy: "u", finalized: false, immutable: true };

describe("buildProjectPlan", () => {
  it("gives a new installation the install phases with its own open items and problems", () => {
    const plan = buildProjectPlan(job);
    expect(plan.source).toBe("standard");
    expect(plan.phases[0].name).toBe("Close the survey gaps");
    expect(plan.phases[0].tasks).toEqual(expect.arrayContaining(["Complete: Measurements", "Complete: Load audit"]));
    expect(plan.phases[1].tasks).toEqual(expect.arrayContaining(["Resolve: Earthing", "Resolve: Board cover"]));
    expect(plan.phases.at(-1)?.name).toBe("Handover");
  });

  it("holds the problems first, and leaves out passed and optional items", () => {
    const plan = buildProjectPlan(job);
    expect(plan.holds[0]).toMatchObject({ title: "Earthing", priority: "high", why: "None installed", basis: [{ kind: "item", ref: "Earthing" }] });
    expect(plan.holds.map((h) => h.title)).not.toContain("Roof");
    expect(plan.holds.map((h) => h.title)).not.toContain("Optional extra");
  });

  it("gives an existing system the repair sequence", () => {
    expect(buildProjectPlan({ ...job, mode: "inspection", context: { scenario: "existing_system" } }).phases[0].name).toBe("Close the inspection gaps");
  });

  it("states no date or duration", () => {
    expect(JSON.stringify(buildProjectPlan(job))).not.toMatch(/\b\d+\s*(day|week|month)s?\b/i);
  });
});

describe("cleanProjectPlan", () => {
  it("returns null with no usable phase, which removes a saved plan", () => {
    expect(cleanProjectPlan(null)).toBeNull();
    expect(cleanProjectPlan({ phases: [{ name: " " }] })).toBeNull();
  });

  it("drops unknown fields and sources, cuts long text and puts high priority first", () => {
    const plan = cleanProjectPlan({
      source: "ai",
      model: "muse-wonder-1.0",
      evil: "x",
      holds: [
        { title: "B", priority: "medium", why: "w", action: "a", basis: [{ kind: "file", ref: "/etc" }, { kind: "item", ref: "Roof" }] },
        { title: "A", priority: "high", why: "w", action: "a" },
      ],
      phases: [{ name: "x".repeat(500), tasks: ["  one ", "", 7], holdPoint: "yes" }],
    })!;
    expect(plan.holds.map((h) => h.title)).toEqual(["A", "B"]);
    expect(plan.holds[1].basis).toEqual([{ kind: "item", ref: "Roof" }]);
    expect(plan.phases[0].name).toHaveLength(100);
    expect(plan.phases[0].tasks).toEqual(["one"]);
    expect(plan.phases[0].holdPoint).toBe(false);
    expect(plan).not.toHaveProperty("evil");
    expect(projectPlanNote(plan)).toContain("muse-wonder-1.0");
  });
});

describe("hasWriteUp", () => {
  it("does not count a plan alone as a written analysis", () => {
    expect(hasWriteUp(undefined)).toBe(false);
    expect(hasWriteUp({ projectPlan: buildProjectPlan(job), summary: " " })).toBe(false);
    expect(hasWriteUp({ summary: "Text" })).toBe(true);
  });
});

describe("the report", () => {
  const plan = buildProjectPlan(job);

  it("shows the plan after the actions, with its text escaped", () => {
    const html = buildReportHtml(snapshot, { ...input, narrative: { projectPlan: { ...plan, phases: [{ ...plan.phases[0], name: "<b>x</b>" }] } } });
    expect(html).toContain("Project plan");
    expect(html).toContain("Settle these before work starts");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(html.indexOf("Project plan")).toBeLessThan(html.indexOf("Appendix A"));
  });

  it("has no plan section on a report that holds no plan", () => {
    expect(buildReportHtml(snapshot, input)).not.toContain("Project plan");
  });

  it("does not claim an all-clear when the report has open items", () => {
    const html = buildReportHtml(snapshot, { ...input, checklist: [], limitations: ["Measurements: marked Not applicable although it is required"] });
    expect(html).not.toContain("No findings, issues or items needing attention");
    expect(html).toContain("this report has open items");
  });

  it("counts a changed plan as a new version to preview", () => {
    const a = previewKey({ id: "s", finalized: false, payload: { narrative: { projectPlan: plan } } });
    const b = previewKey({ id: "s", finalized: false, payload: { narrative: { projectPlan: { ...plan, holds: [] } } } });
    expect(a).not.toBe(b);
  });
});
