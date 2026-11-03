import { describe, it, expect } from "vitest";
import { SCENARIOS, SCENARIO_LIST, isScenario, scenarioFor, scenarioLabel, scenarioPromptHint } from "../scenario";
import { PACK_TEMPLATES, checklistFor, type PackId } from "../packs";

describe("site situation", () => {
  it("an inspection is always an existing system, whatever was sent", () => {
    expect(scenarioFor("inspection", undefined)).toBe("existing");
    expect(scenarioFor("inspection", "new_install")).toBe("existing");
  });
  it("an assessment keeps a valid choice and treats anything else as not set", () => {
    expect(scenarioFor("assessment", "new_install")).toBe("new_install");
    expect(scenarioFor("assessment", "existing")).toBe("existing");
    expect(scenarioFor("assessment", undefined)).toBeNull();
    expect(scenarioFor("assessment", "upgrade")).toBeNull();
    expect(scenarioFor("assessment", 3)).toBeNull();
  });
  it("only the two known values are valid, including odd object keys", () => {
    expect(isScenario("new_install")).toBe(true);
    expect(isScenario("toString")).toBe(false);
    expect(isScenario("")).toBe(false);
    expect(SCENARIO_LIST.map((s) => s.id)).toEqual(["new_install", "existing"]);
  });
  it("labels and prompt hints exist for both, and nothing is claimed when not set", () => {
    expect(scenarioLabel("new_install")).toBe("New installation");
    expect(scenarioLabel("existing")).toBe("Existing system");
    expect(scenarioLabel(null)).toBe("Not set");
    expect(scenarioPromptHint(null)).toBe("");
    expect(scenarioPromptHint("new_install")).toMatch(/NEW INSTALLATION/);
    expect(scenarioPromptHint("existing")).toMatch(/EXISTING SYSTEM/);
    expect(SCENARIOS.new_install.equipmentLabel).not.toBe(SCENARIOS.existing.equipmentLabel);
  });
});

describe("checklist per situation", () => {
  const packs = Object.keys(PACK_TEMPLATES) as PackId[];
  it("a new installation gets a survey list with nothing that assumes equipment already exists", () => {
    for (const pack of packs) {
      const list = checklistFor(pack, "new_install");
      expect(list.length).toBeGreaterThanOrEqual(8);
      expect(list.filter((t) => /^existing\b/i.test(t))).toEqual([]);
      expect(list[list.length - 1]).toMatch(/limitations/i);
    }
  });
  it("an existing system, and a job with no situation, keep today's list", () => {
    for (const pack of packs) {
      expect(checklistFor(pack, "existing")).toEqual(PACK_TEMPLATES[pack].checklist);
      expect(checklistFor(pack, null)).toEqual(PACK_TEMPLATES[pack].checklist);
      expect(checklistFor(pack, undefined)).toEqual(PACK_TEMPLATES[pack].checklist);
    }
  });
  it("every list has unique, non-empty titles", () => {
    for (const pack of packs) {
      for (const s of [null, "new_install", "existing"] as const) {
        const list = checklistFor(pack, s);
        expect(new Set(list).size).toBe(list.length);
        expect(list.every((t) => t.trim().length > 3)).toBe(true);
      }
    }
  });
});

describe("report header shows the situation", () => {
  const snap = { id: "s1", assessmentId: "a1", version: 1, createdAt: "2026-11-01T00:00:00Z", status: "draft" } as unknown as import("../report").ReportSnapshot;
  const input = (mode: "assessment" | "inspection", scenario?: string): import("../report").ReportInput => ({
    siteName: "Test Site",
    mode,
    pack: "solar",
    context: scenario ? { scenario } : {},
    checklist: [],
    findings: [],
    measurements: [],
    limitations: [],
  });
  it("names it for assessments that have one, and always for inspections", async () => {
    const { buildReportHtml } = await import("../reportHtml");
    expect(buildReportHtml(snap, input("assessment", "new_install"))).toContain("New installation");
    expect(buildReportHtml(snap, input("assessment", "existing"))).toContain("Existing system");
    expect(buildReportHtml(snap, input("inspection"))).toContain("Existing system");
  });
  it("says nothing for older assessments with no situation", async () => {
    const { buildReportHtml } = await import("../reportHtml");
    const html = buildReportHtml(snap, input("assessment"));
    expect(html).not.toContain("New installation");
    expect(html).not.toContain("Existing system");
  });
});
