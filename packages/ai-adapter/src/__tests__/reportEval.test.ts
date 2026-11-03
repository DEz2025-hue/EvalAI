import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DraftReportInput } from "../schemas";
import { REPORT_CASES, checkReport } from "./fixtures/reportCases";

// Offline: the evaluation set is well formed, and the automated checks catch the faults they are meant to catch.
// The live run (reportEval.live.test.ts) is skipped unless asked for, because it calls the real model and costs a few cents.

describe("report evaluation set", () => {
  it("every case is valid input for the report analysis, with unique ids and photo ids", () => {
    expect(new Set(REPORT_CASES.map((c) => c.id)).size).toBe(REPORT_CASES.length);
    for (const c of REPORT_CASES) {
      expect(() => DraftReportInput.parse(c.input), c.id).not.toThrow();
      expect(new Set(c.input.photos.map((p) => p.id)).size, c.id).toBe(c.input.photos.length);
    }
  });

  it("covers solar and CCTV, new and existing, with and without photos, a thin record and a trap", () => {
    const has = (f: (c: (typeof REPORT_CASES)[number]) => boolean) => REPORT_CASES.some(f);
    expect(has((c) => c.input.pack === "solar" && c.input.scenario === "new_install")).toBe(true);
    expect(has((c) => c.input.pack === "solar" && c.input.scenario === "existing")).toBe(true);
    expect(has((c) => c.input.pack === "cctv" && c.input.scenario === "new_install")).toBe(true);
    expect(has((c) => c.input.pack === "cctv" && c.input.scenario === "existing")).toBe(true);
    expect(has((c) => c.input.photos.length === 0)).toBe(true);
    expect(has((c) => c.input.photos.length >= 3)).toBe(true);
    expect(has((c) => c.input.checklist.filter((r) => r.status === "not_checked").length >= 3)).toBe(true);
    expect(has((c) => c.input.checklist.some((r) => /IGNORE PREVIOUS INSTRUCTIONS/i.test(r.notes ?? "")))).toBe(true);
  });

  it("no made-up case contains a real-looking name, address, phone number or email", () => {
    const text = JSON.stringify(REPORT_CASES);
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|\+?\d[\d\s-]{8,}\d/i);
    for (const c of REPORT_CASES) expect(c.input.siteName, c.id).toMatch(/\(made up\)/);
  });
});

describe("automated checks on a written report", () => {
  const c = REPORT_CASES[0];
  const good = {
    summary: "Hillside School hall was surveyed for a new rooftop array. Five of six items are checked, and one required item, the load audit, is still to do. The main priorities are the missing earth connection at the main board and afternoon shading from a tree on the north-west side. Both should be assessed by a qualified person before the array is priced, and the load audit completed so the system can be sized.",
    siteOverview: "A single-storey school hall with a tin roof, reachable by ladder only.",
    openItems: "The load audit has not been done. One finding is awaiting review.",
    keyFindings: [
      { title: "No visible earth connection at the main board", priority: "high", observed: "No earth strap was visible at the main board (Photo 2).", meaning: "A missing earth connection means a fault could leave exposed metal live, which is why earthing is checked before new equipment is connected.", action: "Have a qualified electrician inspect the earthing and open the board if needed.", basis: [{ kind: "finding", ref: "Missing earth strap at main board" }] },
      { title: "Afternoon shading from a tree", priority: "medium", observed: "A tree on the north-west side shades the roof in the afternoon (Photo 1).", meaning: "Shade on part of an array can lower the output of the whole string, so panel placement needs care.", action: "Confirm the tree's height and have a qualified person assess the shading.", basis: [] },
    ],
    unverifiedFigures: [] as string[],
    droppedFindings: [] as string[],
  };

  it("passes a good report with no problems", () => {
    expect(checkReport(c, good).problems).toEqual([]);
  });

  it("catches a repeated sentence, compliance wording, a short finding, and a bad summary length", () => {
    const repeated = { ...good, summary: good.summary + " A tree on the north-west side shades the roof in the afternoon (Photo 1)." };
    expect(checkReport(c, repeated).problems.join(" ")).toMatch(/Repeated/);
    const compliant = { ...good, keyFindings: [{ ...good.keyFindings[0], meaning: "The installation is not compliant with the relevant standard and needs attention soon." }] };
    expect(checkReport(c, compliant).problems.join(" ")).toMatch(/Compliance or standards wording/);
    const short = { ...good, keyFindings: [{ ...good.keyFindings[0], action: "Check." }] };
    expect(checkReport(c, short).problems.join(" ")).toMatch(/very short action/);
    expect(checkReport(c, { ...good, summary: "Too short." }).problems.join(" ")).toMatch(/summary is 2 words/);
  });

  it("catches an unchecked item described as fine, but not as a to-do", () => {
    const fine = { ...good, openItems: "The load audit is complete and fine." };
    expect(checkReport(c, fine).problems.join(" ")).toMatch(/Load audit.*was not checked/);
    const todo = { ...good, openItems: "The load audit has not been done yet." };
    expect(checkReport(c, todo).problems).toEqual([]);
  });

  it("flags findings missing when items were flagged, and reports invented figures", () => {
    expect(checkReport(c, { ...good, keyFindings: [] }).problems.join(" ")).toMatch(/no key findings were written/);
    const figures = checkReport(c, { ...good, unverifiedFigures: ["12 kW", "25 years", "$8,400", "15%"] });
    expect(figures.problems.join(" ")).toMatch(/More than three figures/);
    expect(figures.notes.join(" ")).toContain("12 kW");
  });
});

describe("the live evaluation is wired up but off by default", () => {
  it("is a separate file that only runs when asked for", () => {
    const live = fs.readFileSync(path.join(__dirname, "reportEval.live.test.ts"), "utf8");
    expect(live).toMatch(/skipIf\(!process\.env\.LIVE_REPORT_EVAL\)/);
  });
});
