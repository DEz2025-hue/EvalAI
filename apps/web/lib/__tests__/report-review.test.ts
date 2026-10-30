import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// The store keeps demo/local data under <cwd>/.tmp-data. Run it in a throw-away directory.
let store: typeof import("../store");
let dir: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "evalai-report-"));
  // chdir is unavailable in vitest workers — point the store at the temp dir via cwd() before it loads.
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  store = await import("../store");
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const reviewer = { userId: "11111111-1111-4111-8111-111111111111", email: "reviewer@example.com" };

async function newJob() {
  const job = await store.createAssessmentLocal({ siteName: "Test site", mode: "assessment", pack: "solar", goal: "Check roof" });
  return job;
}

async function checkEverything(assessmentId: string, items: Array<{ id: string }>) {
  await store.saveResponsesLocal(assessmentId, items.map((it) => ({ itemId: it.id, status: "pass" })));
}

describe("report review and sign-off", () => {
  it("snapshots are always drafts; direct finalize is refused", async () => {
    const job = await newJob();
    await expect(store.createReportSnapshotLocal({ assessmentId: job.id, finalize: true })).rejects.toThrow(/Cannot finalize directly/);
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    expect(snapshot.finalized).toBe(false);
  });

  it("a draft's narrative can be edited and is trimmed and length-limited", async () => {
    const job = await newJob();
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    const updated = await store.updateSnapshotNarrativeLocal(snapshot.id, { summary: "  Roof is sound.  ", recommendations: "Replace bracket." });
    expect(updated.payload.narrative?.summary).toBe("Roof is sound.");
    expect(updated.htmlPreview).toContain("Roof is sound.");
    expect(updated.htmlPreview).toContain("DRAFT");
    await expect(store.updateSnapshotNarrativeLocal(snapshot.id, { notes: "x".repeat(5001) })).rejects.toThrow(/limited to 5000/);
  });

  it("cannot be finalized while required items are still Not Checked", async () => {
    const job = await newJob();
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    await expect(store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer)).rejects.toThrow(/Cannot finalize — .*blocking issue/);
  });

  it("signs off a reviewed draft: records the reviewer, becomes immutable, marks the job finalized", async () => {
    const job = await newJob();
    await checkEverything(job.id, job.items);
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    await store.updateSnapshotNarrativeLocal(snapshot.id, { summary: "All good." });

    const done = await store.finalizeSnapshotLocal(snapshot.id, "Checked against photos", reviewer);
    expect(done.finalized).toBe(true);
    expect(done.reviewedByLabel).toBe("reviewer@example.com");
    expect(done.reviewNote).toBe("Checked against photos");
    expect(done.reviewedAt).toBeTruthy();
    expect(done.htmlPreview).toContain("signed off by");
    expect(done.htmlPreview).toContain("reviewer@example.com");
    expect((await store.getAssessmentLocal(job.id))?.status).toBe("finalized");

    // immutable afterwards
    await expect(store.updateSnapshotNarrativeLocal(snapshot.id, { summary: "Changed" })).rejects.toThrow(/finalized \(immutable\)/);
    await expect(store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer)).rejects.toThrow(/already finalized/);
    const stored = await store.getSnapshotLocal(snapshot.id);
    expect(stored?.payload.narrative?.summary).toBe("All good.");
  });

  it("refuses to sign off a draft whose facts changed after it was created", async () => {
    const job = await newJob();
    await checkEverything(job.id, job.items);
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    // someone changes a result after the draft was made
    await store.saveResponsesLocal(job.id, [{ itemId: job.items[0].id, status: "fail", notes: "Corroded" }]);
    await expect(store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer)).rejects.toThrow(/changed since this draft/);
    // a fresh draft reflects the change and can then be signed off once unresolved items are checked
    const fresh = await store.createReportSnapshotLocal({ assessmentId: job.id });
    expect(fresh.input.checklist.some((c) => c.status === "fail")).toBe(true);
  });

  it("confirmed findings appear in the report and unreviewed ones block sign-off", async () => {
    const job = await newJob();
    await checkEverything(job.id, job.items);
    const { finding } = await store.saveFindingLocal({ assessmentId: job.id, title: "Cracked mount", description: "Bracket corroded", severity: "high" });
    const draftWithPending = await store.createReportSnapshotLocal({ assessmentId: job.id });
    expect(draftWithPending.input.findings).toHaveLength(0); // not confirmed yet
    await expect(store.finalizeSnapshotLocal(draftWithPending.snapshot.id, undefined, reviewer)).rejects.toThrow(/finding\(s\) still need review/);

    await store.updateFindingStatusLocal(finding.id, "confirmed");
    const draft = await store.createReportSnapshotLocal({ assessmentId: job.id });
    expect(draft.input.findings.map((f) => f.title)).toContain("Cracked mount");
    const done = await store.finalizeSnapshotLocal(draft.snapshot.id, undefined, reviewer);
    expect(done.finalized).toBe(true);
  });
});
