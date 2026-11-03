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

  it("a draft carries what was saved about the job, not just the checklist rows", async () => {
    const job = await newJob();
    await store.updateAssessmentContextLocal(job.id, {
      context: {
        existingEquipment: "None yet",
        constraints: "Ladder access only",
        clarificationAnswers: { q3: "Roof is steep", ai_1: "School term ends in July", q2: " " },
        clarificationQuestions: { ai_1: "When must the work be finished?" },
        intake: { at: "2026-11-01T00:00:00.000Z", mode: "review", description: "Tin roof, tree to the north-west", startHere: null, visible: ["Tin roof"], limitations: ["Roof strength unknown"], evidenceIds: [], added: 0, updated: 0 },
      },
    });
    await store.saveResponsesLocal(job.id, [
      { itemId: job.items[0].id, status: "needs_attention", notes: "Tree shades the array", measuredValue: 4.2, measuredUnit: "m" },
      { itemId: job.items[1].id, status: "pass" },
    ]);
    const { snapshot: created } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    const snapshot = (await store.getSnapshotLocal(created.id))!;
    const p = snapshot.payload;

    expect(p.siteBrief).toMatchObject({ goal: "Check roof", existingEquipment: "None yet", constraints: "Ladder access only", intakeText: "Tin roof, tree to the north-west", intakeVisible: ["Tin roof"], intakeLimits: ["Roof strength unknown"] });
    expect(p.siteBrief?.answers).toEqual([
      { question: "Access constraints or follow-up checks", answer: "Roof is steep" },
      { question: "When must the work be finished?", answer: "School term ends in July" },
    ]);
    expect(p.checklist[0]).toMatchObject({ status: "needs_attention", notes: "Tree shades the array", measured: { value: 4.2, unit: "m" }, evidenceCount: 0 });
    expect(typeof p.checklist[0].required).toBe("boolean");
    expect(p.checklist.some((c) => c.category)).toBe(true);

    // Limitations say what is missing in words; a flagged item is an issue, not a limitation.
    expect(p.limitations.some((l) => /not checked yet \(required\)/.test(l))).toBe(true);
    expect(p.limitations.join(" ")).not.toMatch(/needs_attention|not_checked| — fail/);
    expect(p.limitations.join(" ")).not.toContain(p.checklist[0].title);
    expect(snapshot.htmlPreview).toContain("At a glance:");
    expect(snapshot.htmlPreview).toContain("Key findings");
    expect(snapshot.htmlPreview).toContain("Tree shades the array");
    expect(snapshot.htmlPreview).toContain("School term ends in July");
  });

  it("the longer written sections can be saved, trimmed and limited, and do not count as changed facts at sign-off", async () => {
    const job = await newJob();
    await checkEverything(job.id, job.items);
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    const updated = await store.updateSnapshotNarrativeLocal(snapshot.id, { siteOverview: " A school. ", observations: "x".repeat(8000), issues: "Shading.", openItems: "Load audit still to do." });
    expect(updated.payload.narrative).toMatchObject({ siteOverview: "A school.", issues: "Shading.", openItems: "Load audit still to do." });
    expect(updated.payload.narrative?.observations).toHaveLength(8000);
    await expect(store.updateSnapshotNarrativeLocal(snapshot.id, { observations: "x".repeat(8001) })).rejects.toThrow(/limited to 8000/);
    await expect(store.updateSnapshotNarrativeLocal(snapshot.id, { issues: "x".repeat(5001) })).rejects.toThrow(/limited to 5000/);
    const done = await store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer);
    expect(done.finalized).toBe(true);
  });

  it("key findings are saved whole, cleaned, shown in the preview, and don't count as changed facts at sign-off", async () => {
    const job = await newJob();
    await checkEverything(job.id, job.items);
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    const updated = await store.updateSnapshotNarrativeLocal(snapshot.id, {
      keyFindings: [
        { id: "f1", title: "  Afternoon shading  ", priority: "medium", observed: " A tree shades the roof. ", meaning: "Shade lowers output.", action: "Have it assessed.", basis: [{ kind: "item", ref: job.items[0].title }], source: "ai" },
        { id: "f1", title: "Second finding", priority: "low", observed: "x", meaning: "", action: "", basis: [], source: "person", confirmed: true, evidenceCount: 2 },
      ],
    });
    const saved = updated.payload.narrative?.keyFindings ?? [];
    expect(saved.map((f) => f.title)).toEqual(["Afternoon shading", "Second finding"]);
    expect(saved[0].observed).toBe("A tree shades the roof.");
    expect(new Set(saved.map((f) => f.id)).size).toBe(2); // a repeated id is made unique
    expect(saved[1]).toMatchObject({ confirmed: true, evidenceCount: 2 });
    expect(updated.htmlPreview).toContain("Afternoon shading");
    expect(updated.htmlPreview).toContain("Recommended actions");
    // editing the text sections later keeps the findings
    const again = await store.updateSnapshotNarrativeLocal(snapshot.id, { summary: "Summary." });
    expect(again.payload.narrative?.keyFindings).toHaveLength(2);
    const done = await store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer);
    expect(done.finalized).toBe(true);
    expect((await store.getSnapshotLocal(snapshot.id))?.payload.narrative?.keyFindings).toHaveLength(2);
  });

  it("refuses key findings that are incomplete or too big, and an empty list clears them", async () => {
    const job = await newJob();
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: job.id });
    const ok = { title: "T", priority: "high", observed: "o", meaning: "m", action: "a", basis: [], source: "person" } as const;
    const save = (keyFindings: unknown) => store.updateSnapshotNarrativeLocal(snapshot.id, { keyFindings } as never);
    await expect(save([{ ...ok, title: "   " }])).rejects.toThrow(/needs a title/);
    await expect(save([{ ...ok, priority: "urgent" }])).rejects.toThrow(/priority/);
    await expect(save([{ ...ok, action: "x".repeat(801) }])).rejects.toThrow(/action is limited to 800/);
    await expect(save([{ ...ok, basis: [{ kind: "wish", ref: "x" }] }])).rejects.toThrow(/unknown type/);
    await expect(save(Array.from({ length: 21 }, () => ok))).rejects.toThrow(/at most 20/);
    await expect(save("not a list")).rejects.toThrow(/must be a list/);
    await save([ok]);
    expect((await save([])).payload.narrative?.keyFindings).toEqual([]);
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
