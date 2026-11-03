import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Site intake (D-021): suggestions only. It adds items and "look for" text; it never answers the checklist.
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("site intake never decides anything", () => {
  const screen = read("apps/mobile/components/SiteIntake.tsx");
  const api = read("apps/mobile/lib/intakeApi.ts");

  it("never writes checklist answers, findings or measurements", () => {
    for (const src of [screen, api]) {
      expect(src).not.toMatch(/\/api\/checklist\/responses|\/api\/findings|\/api\/measurements/);
    }
  });

  it("changes the checklist only through mergeIntake, with review as the default mode", () => {
    expect(screen).toContain("mergeIntake");
    expect(screen).toMatch(/useState<IntakeMode>\("review"\)/);
    expect(screen).toContain("Nothing is added until you tap Apply");
    expect(screen).toContain("AI suggestion — needs your review");
  });

  it("keeps the photos as evidence before asking the AI, and still works when the AI fails", () => {
    expect(screen.indexOf("deps.savePhoto")).toBeGreaterThan(-1);
    expect(screen.indexOf("deps.savePhoto")).toBeLessThan(screen.indexOf("deps.guide("));
    expect(screen).toContain("Continue with the standard checklist");
  });

  it("the server route labels the answer and stores nothing", () => {
    const route = read("apps/web/app/api/ai/site-intake/route.ts");
    expect(route).toContain("requireWriter");
    expect(route).toContain("aiGuard");
    expect(route).toContain("loadAssessmentFacts");
    expect(route).toContain("needs your review");
  });

  it("a new job goes to the intake first and it can be skipped", () => {
    expect(read("apps/mobile/app/(tabs)/create.tsx")).toContain("/intake?first=1");
    expect(screen).toContain("Skip, use the standard checklist");
  });
});
