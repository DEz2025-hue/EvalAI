import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// D-028: the report is built around key findings, drafted automatically, edited by a person, and every AI statement stays labelled.
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("key findings in the report screens", () => {
  it("web and mobile both draft the findings when a draft is created and save them with the draft", () => {
    const web = read("apps/web/components/ReportView.tsx");
    expect(web).toContain("narrative: { ...text, keyFindings }");
    expect(web).toContain('stage: "summary"');
    expect(web).toContain("Rewrite summary from my findings");
    const mobile = read("apps/mobile/app/assessments/[id]/report.tsx");
    expect(mobile).toContain("keyFindings: t.keyFindings ?? []");
    expect(mobile).toContain('stage: "summary"');
    expect(mobile).toContain("Rewrite summary from my findings");
  });

  it("the editors let the person confirm, change and remove each finding, and say what is AI interpretation", () => {
    for (const f of ["apps/web/components/KeyFindingsEditor.tsx", "apps/mobile/components/KeyFindingsMobile.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/confirmed/);
      expect(src, f).toMatch(/Remove/);
      expect(src, f).toMatch(/Add a finding/);
      expect(src, f).toMatch(/interpretation/i);
      expect(src, f).toMatch(/AI draft/);
    }
  });

  it("the reports label what the AI wrote: interpretation, AI drafts, and unverified photo descriptions", () => {
    const html = read("packages/shared/src/reportHtml.ts");
    expect(html).toContain("interpretation, including general technical knowledge");
    expect(html).toContain("AI draft — not yet confirmed");
    expect(html).toContain("AI description, not verified");
    const pdf = read("apps/web/lib/pdf.ts");
    expect(pdf).toContain("What it means (interpretation, including general technical knowledge)");
    expect(pdf).toContain("AI draft, not yet confirmed");
    expect(pdf).toContain("[AI description, not verified]");
  });

  it("a draft waits for the person's photo answers on the web, as on the phone", () => {
    const web = read("apps/web/components/ReportView.tsx");
    expect(web).toContain("photosWaiting > 0");
    const steps = read("apps/web/components/ReportPhotoSteps.tsx");
    expect(steps).toContain("/api/ai/report-photos");
    expect(steps).toContain("/api/reports/photo-choices");
    expect(steps).toContain("Add to report");
    expect(steps).toContain("Leave out");
    expect(steps).toContain("not verified");
  });

  it("the findings never enter the sign-off facts check (they are narrative), and the preview lock covers them", () => {
    const store = read("apps/web/lib/store.ts");
    // The narrative, the photo notes and the office template (how the report looks, D-031) are not "stored facts".
    expect(store).toMatch(/const \{ narrative: _narrative, photos: _photos, template: _template, \.\.\.facts \} = input/);
    expect(read("packages/shared/src/reportGate.ts")).toContain("n.keyFindings ?? []");
  });
});
