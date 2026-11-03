import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Photos by the person's choice, and a real preview before any download (D-024).
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("the person chooses the photos", () => {
  const chooser = read("apps/mobile/components/ReportPhotoChoices.tsx");
  const report = read("apps/mobile/app/assessments/[id]/report.tsx");

  it("every photo needs a yes or a no before Continue works, and nothing is pre-answered for the person", () => {
    expect(chooser).toContain("disabled={unanswered > 0 || saving}");
    expect(chooser).toContain("Your answer needed");
    expect(chooser).toContain("Add to report");
    expect(chooser).toContain("Leave out");
    // Only photos that were already answered start answered.
    expect(chooser).toContain("Object.fromEntries(photos.map((p) => [p.evidenceId, p.choice]))");
  });

  it("the preparation waits for the answers, and stops cleanly if they are cancelled", () => {
    expect(report).toContain('"/api/reports/photo-choices"');
    expect(report).toContain("chooseDone.current = resolve");
    expect(report).toContain("The report was not prepared because the photo choices were cancelled");
    // The draft is built only after the choosing step.
    expect(report.indexOf('setPreparing("choose")')).toBeLessThan(report.indexOf('setPreparing("draft")'));
  });

  it("the server only puts photos with an explicit yes into a report", () => {
    const photos = read("apps/web/lib/reportPhotos.ts");
    expect(photos).toContain("choices?.[id] === true");
    expect(read("apps/web/lib/store.ts")).toContain("assessment.context.photoChoices");
  });
});

describe("preview before download", () => {
  const report = read("apps/mobile/app/assessments/[id]/report.tsx");
  const preview = read("apps/mobile/app/assessments/[id]/report-preview.tsx");

  it("the draft's PDF button is locked by the gate, and the download function re-checks it", () => {
    expect(report).toContain("disabled={busy !== null || gate.locked}");
    expect(report).toMatch(/if \(!selected \|\| gate\.locked\) return;/);
    expect(preview).toContain("disabled={gate.locked || busy}");
  });

  it("the preview shows the stored report document with no script allowed, and counts as seen only once it is drawn", () => {
    expect(preview).toContain("javaScriptEnabled={false}");
    expect(preview).toContain('sandbox: ""');
    expect(preview).toContain("onLoadEnd={onShown}");
    expect(preview).toContain("markPreviewed(");
    expect(preview).toContain("htmlPreview");
  });

  it("preparing a report opens the preview straight away", () => {
    expect(report).toContain("report-preview?snapshotId=");
  });

  it("the web page locks the draft's Download button until the preview is confirmed", () => {
    const web = read("apps/web/components/ReportView.tsx");
    expect(web).toContain("disabled={!selected || busy !== null || gate.locked}");
    expect(web).toContain("I&apos;ve looked through this preview");
  });
});
