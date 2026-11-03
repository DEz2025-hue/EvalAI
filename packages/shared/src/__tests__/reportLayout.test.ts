import { describe, it, expect } from "vitest";
import { buildReportHtml } from "../reportHtml";
import { statusLabel } from "../checklist";
import { buildKeyFindings, checklistGlance, glanceSentence, groupByCategory, keyFindingsFor, photoNumbers, recommendedActions, reportLayout, siteBriefLines } from "../reportOverview";
import { NARRATIVE_SECTIONS, type ReportInput, type ReportKeyFinding, type ReportPhoto, type ReportSnapshot } from "../report";
import { previewKey } from "../reportGate";

const snap: ReportSnapshot = { id: "snap_1", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-01T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };

const photo = (over: Partial<ReportPhoto> = {}): ReportPhoto => ({ evidenceId: "ev-1", caption: "A large tree beside the roof.", itemTitle: "Orientation, tilt, shading survey", observations: ["Tree is taller than the roof edge"], possibleIssues: [{ text: "Branches may touch the roof", confidence: "low" }], cannotTell: ["Roof underside"], ...over });

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  siteName: "Hillside School",
  mode: "assessment",
  pack: "solar",
  context: { goal: "Quote a rooftop array", scenario: "new_install" },
  checklist: [
    { title: "Roof / structure / mounting constraints", status: "pass", notes: "Corrugated iron, good condition", category: "Site", required: true, evidenceCount: 2 },
    { title: "Orientation, tilt, shading survey", status: "needs_attention", notes: "Large tree on the north-west side", category: "Site", required: true, evidenceCount: 1 },
    { title: "Wiring, protection & earthing review", status: "fail", notes: "Earth strap missing", category: "Electrical", required: true },
    { title: "Load audit — demand & operating hours", status: "not_checked", category: "Customer", required: true },
    { title: "Batteries — type, capacity, condition (if present)", status: "not_applicable", notes: "No batteries on site", category: "System", required: false },
    { title: "Measurements — roof area", status: "pass", category: "Measurements", required: true, measured: { value: 42.5, unit: "m²" } },
  ],
  findings: [],
  measurements: [{ name: "Roof area", value: 42.5, unit: "m²" }],
  limitations: ["Load audit — demand & operating hours: not checked yet (required)"],
  ...over,
});

const finding = (over: Partial<ReportKeyFinding> = {}): ReportKeyFinding => ({
  id: "f1",
  title: "Afternoon shading from a tree",
  priority: "medium",
  observed: "A tree on the north-west side shades the roof in the afternoon (Photo 1).",
  meaning: "Shade on part of an array can lower the output of a whole string.",
  action: "Confirm the tree's height and have a qualified person assess the shading.",
  basis: [{ kind: "item", ref: "Orientation, tilt, shading survey" }, { kind: "photo", ref: "ev-1" }],
  source: "ai",
  ...over,
});

const section = (html: string, title: string) => {
  const start = html.indexOf(`<h2>${title}</h2>`);
  if (start < 0) return "";
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
};

describe("plain-language results", () => {
  it("never shows a raw status code in the report", () => {
    const html = buildReportHtml(snap, input());
    expect(html).not.toMatch(/needs_attention|not_checked|not_applicable/);
    expect(html).toContain("Needs attention");
    expect(html).toContain("Issue found");
    expect(html).toContain("Not applicable");
    expect(html).toContain("Not Checked");
  });

  it("labels each stored status, and treats an unknown one as Not Checked (never as Pass)", () => {
    expect([statusLabel("pass"), statusLabel("fail"), statusLabel("needs_attention"), statusLabel("not_applicable"), statusLabel("not_checked")]).toEqual(["Pass", "Issue found", "Needs attention", "Not applicable", "Not Checked"]);
    expect(statusLabel("something_else")).toBe("Not Checked");
  });
});

describe("counts from the checklist", () => {
  it("counts, names the required items still open, and lists the flagged ones", () => {
    const g = checklistGlance(input().checklist);
    expect(g).toMatchObject({ total: 6, checked: 5, counts: { pass: 2, fail: 1, needs_attention: 1, not_applicable: 1, not_checked: 1 } });
    expect(g.requiredOpen.map((r) => r.title)).toEqual(["Load audit — demand & operating hours"]);
    expect(g.flagged.map((r) => r.title)).toEqual(["Orientation, tilt, shading survey", "Wiring, protection & earthing review"]);
    expect(glanceSentence(g)).toBe("5 of 6 items checked: 2 Pass, 1 Issue found, 1 Needs attention, 1 Not applicable. 1 required item is still Not Checked.");
    expect(glanceSentence(checklistGlance([]))).toBe("No checklist items were recorded for this job.");
  });

  it("is one line in a findings report, and the open required item is in the limitations (said once)", () => {
    const html = buildReportHtml(snap, input());
    expect(html).toContain("At a glance: 5 of 6 items checked");
    expect(html).not.toContain("<h2>Report at a glance</h2>");
    expect(section(html, "Open items, limitations & uncertainty")).toContain("Load audit — demand &amp; operating hours: not checked yet (required)");
  });
});

describe("a report with no written findings (AI off) still reads as findings", () => {
  const html = buildReportHtml(snap, input({ photos: [photo({ evidenceId: "ev-1" })] }));

  it("builds the key findings from the items marked Issue or Needs attention, highest priority first, with the technician's notes", () => {
    const f = section(html, "Key findings");
    expect(f.indexOf("Wiring, protection &amp; earthing review")).toBeGreaterThan(-1);
    expect(f.indexOf("Wiring, protection &amp; earthing review")).toBeLessThan(f.indexOf("Orientation, tilt, shading survey")); // Issue found = high, before Needs attention
    expect(f).toContain("Earth strap missing");
    expect(f).toContain("Large tree on the north-west side");
    expect(f).toContain("High priority");
    expect(f).not.toContain("Corrugated iron"); // a pass is not a finding
    expect(f).not.toContain("Load audit"); // not checked: a limitation, not a finding
  });

  it("cites the photos linked to an item, with the picture description marked as not verified", () => {
    const f = section(html, "Key findings");
    expect(f).toContain("Photo 1");
    expect(f).toContain("A large tree beside the roof.");
    expect(f).toContain("AI description, not verified");
    expect(html).not.toContain("<h2>Other photos</h2>"); // the only photo is shown in its finding
  });

  it("has no empty written sections, and keeps the full checklist in an appendix grouped by area", () => {
    expect(html).not.toContain("<h2>Executive summary</h2>");
    expect(html).not.toContain("<h2>Recommended actions</h2>"); // no actions were written
    const appendix = section(html, "Appendix A — Checklist results");
    for (const t of ["Site", "Electrical", "Customer", "System", "Measurements"]) expect(appendix).toContain(t);
    expect(appendix).toContain("Measured: 42.5 m²");
    expect(appendix).toContain("Not Checked ≠ Pass");
  });

  it("says so when nothing needs attention", () => {
    const calm = buildReportHtml(snap, input({ checklist: [{ title: "Roof", status: "pass" }], limitations: [] }));
    expect(section(calm, "Key findings")).toContain("No findings, issues or items needing attention were recorded");
  });
});

describe("a report with written key findings", () => {
  const written = input({
    photos: [photo({ evidenceId: "ev-1" }), photo({ evidenceId: "ev-2", caption: "The main board in a store room.", itemTitle: "Wiring, protection & earthing review", possibleIssues: [] })],
    narrative: {
      summary: "The roof suits an array; shading and earthing need attention before the work is priced.",
      siteOverview: "A single-storey school building.",
      keyFindings: [
        finding({ id: "f1", priority: "medium" }),
        finding({ id: "f2", title: "No earth connection at the main board", priority: "high", observed: "No earth strap was visible at the main board (Photo 2).", meaning: "A missing earth connection means a fault could leave exposed metal live.", action: "Have a qualified electrician inspect the earthing.", basis: [{ kind: "item", ref: "Wiring, protection & earthing review" }, { kind: "photo", ref: "ev-2" }] }),
        finding({ id: "f3", title: "Context: school term dates", priority: "info", observed: "Work is wanted before July.", meaning: "", action: "", basis: [] }),
      ],
      openItems: "The load audit is still to do.",
      notes: "Reviewed on site.",
    },
  });
  const html = buildReportHtml(snap, written);

  it("shows each finding once, as observed / what it means / action, highest priority first", () => {
    const f = section(html, "Key findings");
    expect(f.indexOf("No earth connection")).toBeLessThan(f.indexOf("Afternoon shading"));
    expect(f.indexOf("Afternoon shading")).toBeLessThan(f.indexOf("Context: school term dates"));
    expect(f).toContain("Observed.");
    expect(f).toContain("What it means");
    expect(f).toContain("interpretation");
    expect(f).toContain("Recommended action.");
    expect(f).toContain("AI draft — not yet confirmed");
    expect(f).toContain("Based on: Checklist: Wiring, protection &amp; earthing review · Photo 2");
    // one home per fact: a finding's own text appears once outside the appendix
    expect(html.split("shades the roof in the afternoon").length - 1).toBe(1);
    expect(html.split("could leave exposed metal live").length - 1).toBe(1);
  });

  it("builds the recommended actions from the findings (no second telling), sorted by priority, skipping findings with no action", () => {
    const actions = section(html, "Recommended actions");
    expect(actions.indexOf("No earth connection")).toBeLessThan(actions.indexOf("Afternoon shading"));
    expect(actions).toContain("Have a qualified electrician inspect the earthing.");
    expect(actions).not.toContain("Context: school term dates");
    expect(recommendedActions(keyFindingsFor(written)).map((a) => a.id)).toEqual(["f2", "f1"]);
  });

  it("puts photos inside the findings that cite them, and the rest under 'Other photos'", () => {
    const withExtra = buildReportHtml(snap, { ...written, photos: [...(written.photos ?? []), photo({ evidenceId: "ev-3", caption: "A fence line.", itemTitle: undefined, possibleIssues: [{ text: "Gate looks loose", confidence: "low" }] })] });
    expect(section(withExtra, "Other photos")).toContain("A fence line.");
    expect(section(withExtra, "Other photos")).not.toContain("A large tree beside the roof.");
    expect(section(withExtra, "Key findings")).toContain("A large tree beside the roof.");
    expect(withExtra).toContain("Gate looks loose"); // an uncited photo's possible issue stays listed, labelled not verified
    expect(withExtra).toContain("Photo 3");
  });

  it("orders the report: summary, site, findings, actions, then open items and the appendices", () => {
    const order = ["Executive summary", "At a glance:", "Site and scope", "Key findings", "Recommended actions", "Materials schedule", "Open items, limitations & uncertainty", "Appendix A", "Appendix B", "Reviewer notes"].map((t) => html.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("What was found, by area");
    expect(html).not.toContain("<h2>Issues and risks</h2>");
  });

  it("marks a finding the reviewer confirmed, and escapes every written part", () => {
    const html2 = buildReportHtml(snap, input({ narrative: { keyFindings: [finding({ title: "<script>alert(1)</script>", observed: "<img src=x onerror=1>", meaning: "<b>m</b>", action: "<i>a</i>", confirmed: true, basis: [{ kind: "item", ref: "<u>x</u>" }] })] } }));
    expect(html2).toContain("Confirmed by the reviewer");
    for (const bad of ["<script>alert(1)", "<img src=x", "<b>m</b>", "<i>a</i>", "<u>x</u>"]) expect(html2).not.toContain(bad);
  });
});

describe("confirmed findings are never dropped", () => {
  const confirmed = { title: "Cracked mount", severity: "high", description: "Corroded bracket", uncertainty: "hidden side not visible", evidenceCount: 3, status: "confirmed" };

  it("appear as key findings with their evidence count when there is no written finding", () => {
    const f = buildKeyFindings(input({ findings: [confirmed] }));
    expect(f[0]).toMatchObject({ title: "Cracked mount", priority: "high", confirmed: true, evidenceCount: 3, basis: [{ kind: "finding", ref: "Cracked mount" }] });
    const html = buildReportHtml(snap, input({ findings: [confirmed] }));
    expect(section(html, "Key findings")).toContain("Corroded bracket");
    expect(section(html, "Key findings")).toContain("Evidence linked: 3");
  });

  it("are added back when the written findings leave one out, but not when one already covers it", () => {
    const written = input({ findings: [confirmed], narrative: { keyFindings: [finding()] } });
    expect(keyFindingsFor(written).map((f) => f.title)).toContain("Cracked mount");
    const covered = input({ findings: [confirmed], narrative: { keyFindings: [finding({ title: "Mount failure", basis: [{ kind: "finding", ref: "Cracked mount" }] })] } });
    expect(keyFindingsFor(covered).map((f) => f.title)).toEqual(["Mount failure"]);
  });

  it("a finding that is only awaiting review is not in the report", () => {
    expect(buildKeyFindings(input({ findings: [{ title: "Maybe a leak", status: "needs_review" }], checklist: [] }))).toEqual([]);
  });
});

describe("site and scope", () => {
  it("shows what was saved about the job, and the answered scope questions", () => {
    const html = buildReportHtml(snap, input({
      siteBrief: { goal: "Quote a rooftop array", existingEquipment: "None", intakeText: "Tin roof, big tree to the north-west", intakeLimits: ["Roof strength is unknown"], answers: [{ question: "Access constraints or follow-up checks", answer: "Ladder needed" }, { question: "Unanswered", answer: " " }] },
    }));
    const scope = section(html, "Site and scope");
    expect(scope).toContain("Quote a rooftop array");
    expect(scope).toContain("Tin roof, big tree to the north-west");
    expect(scope).toContain("Roof strength is unknown");
    expect(scope).toContain("Ladder needed");
    expect(scope).not.toContain("Unanswered");
  });

  it("falls back to the goal in the job context for older snapshots without a site brief", () => {
    expect(siteBriefLines(undefined, "Install 10 panels")).toEqual([{ label: "Purpose of the job", value: "Install 10 panels" }]);
    expect(section(buildReportHtml(snap, input({ siteBrief: undefined })), "Site and scope")).toContain("Quote a rooftop array");
  });
});

describe("older reports still render the way they did", () => {
  it("free-text observations and issues keep the older layout", () => {
    const old = input({ narrative: { summary: "S", observations: "Site: the roof is sound.", issues: "Shading from the tree.", recommendations: "Check the earthing." } });
    expect(reportLayout(old)).toBe("legacy");
    const html = buildReportHtml(snap, old);
    for (const t of ["Executive summary", "Report at a glance", "Site and scope", "What was found, by area", "Issues and risks", "Recommended next steps"]) expect(html).toContain(t);
    expect(section(html, "What was found, by area")).toContain("the roof is sound");
    expect(html).not.toContain("<h2>Key findings</h2>");
  });

  it("a payload with only the original fields (summary, recommendations, notes) gets the findings layout and keeps its text", () => {
    const old: ReportInput = { siteName: "Old", mode: "inspection", pack: "cctv", context: { goal: "g" }, checklist: [{ title: "Cameras", status: "pass" }], findings: [], measurements: [], limitations: [], narrative: { summary: "S", recommendations: "R", notes: "N" } };
    expect(reportLayout(old)).toBe("findings");
    const html = buildReportHtml(snap, old);
    for (const t of ["Executive summary", "Site and scope", "Key findings", "Additional recommendations", "Appendix A", "Reviewer notes"]) expect(html).toContain(t);
    expect(buildReportHtml(snap, old)).toBe(html); // deterministic
  });

  it("groups items without a category under General", () => {
    expect(groupByCategory([{ title: "A", status: "pass" }, { title: "B", status: "pass", category: "Site" }]).map((g) => g.category)).toEqual(["General", "Site"]);
  });

  it("numbers photos by their order in the report", () => {
    expect(photoNumbers({ photos: [photo({ evidenceId: "a" }), photo({ evidenceId: "b" })] }).get("b")).toBe(2);
  });
});

describe("preview lock covers every written part", () => {
  it("changes the key when any text section or any finding changes", () => {
    const base = { id: "s", finalized: false, payload: { narrative: {} as Record<string, unknown> } };
    const keys = new Set([previewKey(base as never)]);
    for (const { key } of NARRATIVE_SECTIONS) keys.add(previewKey({ ...base, payload: { narrative: { [key]: "changed" } } } as never));
    keys.add(previewKey({ ...base, payload: { narrative: { keyFindings: [finding()] } } } as never));
    keys.add(previewKey({ ...base, payload: { narrative: { keyFindings: [finding({ action: "A different action." })] } } } as never));
    expect(keys.size).toBe(NARRATIVE_SECTIONS.length + 3);
  });
});

describe("materials in the report (D-029)", () => {
  const html = (materials: ReportInput["materials"]) => buildReportHtml(snap, input({ materials }));

  it("shows the specification, an AI badge, provisional and TBD markers, and the one note", () => {
    const out = html([
      { description: "Solar modules", quantity: 12, unit: "pcs", rationale: "5 kW wanted", provisional: true, specification: "450 W class module, to be confirmed", source: "ai_suggested" },
      { description: "DC cable", quantity: 1, unit: "m", rationale: "Route not measured", provisional: true, source: "ai_suggested", quantityTbd: true },
    ]);
    expect(out).toContain("450 W class module, to be confirmed");
    expect(out).toContain("AI suggestion");
    expect(out).toContain("12 pcs");
    expect(out).toMatch(/TBD/);
    expect(out).not.toContain("1 m");
    expect(out).toContain("not a quotation and not a design");
  });

  it("a list with no AI items looks as before: no badge, no note", () => {
    const out = html([{ description: "Rail", quantity: 4, unit: "ea", rationale: "Two per plane", provisional: false }]);
    expect(out).toContain("4 ea");
    expect(out).not.toContain("AI suggestion");
    expect(out).not.toContain("not a quotation and not a design");
  });

  it("never adds a price", () => {
    const out = html([{ description: "Solar modules", quantity: 12, unit: "pcs", rationale: "5 kW wanted", source: "ai_suggested" }]);
    expect(out).not.toMatch(/[$€£]\s?\d/);
  });
});

describe("site interview in the report (D-030)", () => {
  const interview = { details: [{ label: "Night use", value: "Security lights and a fridge" }], statements: [{ question: "Where is the main board?", answer: "In the store room, the door is never locked." }], openQuestions: ["How many fridges run overnight?"] };
  const html = (iv?: typeof interview) => buildReportHtml(snap, input({ siteBrief: { goal: "Quote a rooftop array", ...(iv ? { interview: iv } : {}) } }));

  it("shows the details, the questions and answers, and says they are statements", () => {
    const out = html(interview);
    expect(out).toContain("Site interview");
    expect(out).toContain("Security lights and a fridge");
    expect(out).toContain("In the store room, the door is never locked.");
    expect(out).toContain("statements, not verified facts");
    expect(out).toContain("How many fridges run overnight?");
  });

  it("without an interview the report is as before", () => {
    expect(html()).not.toContain("Site interview");
  });

  it("escapes what was said", () => {
    const out = html({ ...interview, statements: [{ question: "Q?", answer: "<script>alert(1)</script>" }] });
    expect(out).not.toContain("<script>alert(1)</script>");
  });
});
