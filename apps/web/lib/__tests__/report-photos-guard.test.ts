import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Report photos (D-022): what the AI says about photos stays unverified, stays out of the findings, and never changes an answer.
const root = path.join(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("photo notes in reports are always unverified", () => {
  it("every place that shows them says so", () => {
    expect(read("packages/shared/src/reportHtml.ts")).toContain("AI description, not verified");
    expect(read("packages/shared/src/reportHtml.ts")).toContain("Possible issues seen in photos (AI, not verified)");
    expect(read("apps/web/lib/pdf.ts")).toContain("AI description, not verified");
    expect(read("apps/web/lib/pdf.ts")).toContain("Possible issues seen in photos (AI, not verified)");
    const mobile = read("apps/mobile/app/assessments/[id]/report.tsx");
    expect(mobile).toContain("AI description — not verified");
    expect(mobile).toContain("Possible issues seen in photos (AI, not verified)");
  });

  it("the photo review prompt and the summary prompt forbid findings, measurements and verdicts", () => {
    const review = read("packages/ai-adapter/src/photoReview.ts");
    expect(review).toContain("never invent details that are not visible");
    expect(review).toMatch(/never say anything passes, fails or is compliant/);
    expect(review).toContain("do not change or contradict them");
    const text = read("packages/ai-adapter/src/reportDraft.ts");
    expect(text).toContain("UNVERIFIED descriptions");
    expect(text).toContain("Never present a photo note as a confirmed finding");
  });

  it("the review route stores only on the job context, picks photos on the server, and is rate limited", () => {
    const route = read("apps/web/app/api/ai/report-photos/route.ts");
    expect(route).toContain("requireWriter");
    expect(route).toContain("aiGuard");
    expect(route).toContain("loadAssessmentFacts");
    expect(route).toContain("selectReportPhotos");
    expect(route).not.toMatch(/\/api\/findings|saveFindingLocal|replaceChecklist|saveResponse|upsertResponse/i);
  });

  it("photos can only be removed from a draft, and sign-off does not treat them as stored facts", () => {
    const store = read("apps/web/lib/store.ts");
    const remove = store.slice(store.indexOf("export async function removeSnapshotPhotosLocal"), store.indexOf("export async function updateSnapshotNarrativeLocal"));
    expect(remove).toContain("snap.finalized");
    expect(remove).toContain("immutable");
    expect(store).toMatch(/photos: _photos/);
  });

  it("the report context does not carry the raw photo notes twice", () => {
    expect(read("apps/web/lib/store.ts")).toMatch(/photoReview: _photoReview, photoChoices: _photoChoices, intake: _intake/);
  });

  it("turning a possible issue into a finding goes through the normal finding route with the photo as evidence", () => {
    const mobile = read("apps/mobile/app/assessments/[id]/report.tsx");
    expect(mobile).toContain('"/api/findings"');
    expect(mobile).toContain("evidenceRefs: [evidenceId]");
    expect(mobile).toContain("Needs a person's review");
  });

  it("Preview report on the job starts the preparation", () => {
    expect(read("apps/mobile/app/assessments/[id].tsx")).toContain("/report?prepare=1");
    expect(read("apps/mobile/app/assessments/[id]/report.tsx")).toContain('prepare === "1"');
  });
});
