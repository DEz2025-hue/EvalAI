import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let store: typeof import("../store");
let dir: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "evalai-tpl-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  store = await import("../store");
});
afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const reviewer = { userId: "11111111-1111-4111-8111-111111111111", email: "reviewer@example.com" };
const style = (name: string) => ({ officeName: name, accentColor: "#b91c1c", footerText: `${name} footer`, sections: [{ id: "materials" as const, visible: false }] });

async function job() {
  return store.createAssessmentLocal({ siteName: "Test site", mode: "assessment", pack: "solar", goal: "Check roof" });
}

describe("office report style: storage", () => {
  it("is null until set, then saved in a clean, complete form", async () => {
    expect(await store.getReportTemplateLocal()).toBeNull();
    const saved = await store.saveReportTemplateLocal({ officeName: "  Bright Energy  ", sections: [{ id: "summary", visible: true }] });
    expect(saved.officeName).toBe("Bright Energy");
    expect(saved.sections).toHaveLength(10); // every section is present exactly once
    expect((await store.getReportTemplateLocal())?.officeName).toBe("Bright Energy");
  });

  it("can be reset to the built-in style", async () => {
    await store.saveReportTemplateLocal(style("Reset Me"));
    await store.resetReportTemplateLocal();
    expect(await store.getReportTemplateLocal()).toBeNull();
  });
});

describe("office report style: drafts and finalized reports", () => {
  it("a new draft gets a copy of the style and is drawn with it", async () => {
    await store.saveReportTemplateLocal(style("Bright Energy"));
    const j = await job();
    const { snapshot, input } = await store.createReportSnapshotLocal({ assessmentId: j.id });
    expect(input.template?.officeName).toBe("Bright Energy");
    expect(snapshot.htmlPreview).toContain("Bright Energy — assessment report");
    expect(snapshot.htmlPreview).not.toContain("Materials schedule");
  });

  it("with no style set, a draft carries none and looks as before", async () => {
    await store.resetReportTemplateLocal();
    const j = await job();
    const { snapshot, input } = await store.createReportSnapshotLocal({ assessmentId: j.id });
    expect(input.template).toBeUndefined();
    expect(snapshot.htmlPreview).toContain("EvalAI — assessment report");
  });

  it("changing the style later does not change a draft that was already made, until it is re-applied", async () => {
    await store.saveReportTemplateLocal(style("First Office"));
    const j = await job();
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: j.id });
    await store.saveReportTemplateLocal(style("Second Office"));
    expect((await store.getSnapshotLocal(snapshot.id))?.payload.template?.officeName).toBe("First Office");
    const again = await store.reapplyReportTemplateLocal(snapshot.id);
    expect(again.payload.template?.officeName).toBe("Second Office");
    expect(again.htmlPreview).toContain("Second Office");
  });

  it("re-applying with no style set takes the style off the draft", async () => {
    await store.saveReportTemplateLocal(style("Gone Soon"));
    const j = await job();
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: j.id });
    await store.resetReportTemplateLocal();
    const again = await store.reapplyReportTemplateLocal(snapshot.id);
    expect(again.payload.template).toBeUndefined();
    expect(again.htmlPreview).toContain("EvalAI — assessment report");
  });

  it("a finalized report keeps its style and cannot be restyled", async () => {
    await store.saveReportTemplateLocal(style("Signing Office"));
    const j = await job();
    await store.saveResponsesLocal(j.id, j.items.map((it) => ({ itemId: it.id, status: "pass" })));
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: j.id });
    await store.updateSnapshotNarrativeLocal(snapshot.id, { summary: "All good." });
    const done = await store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer);
    expect(done.finalized).toBe(true);
    await store.saveReportTemplateLocal(style("Different Office"));
    await expect(store.reapplyReportTemplateLocal(snapshot.id)).rejects.toThrow(/finalized/);
    const stored = await store.getSnapshotLocal(snapshot.id);
    expect(stored?.payload.template?.officeName).toBe("Signing Office");
    expect(stored?.htmlPreview).toContain("Signing Office");
  });

  it("restyling a draft does not make the sign-off think the facts changed", async () => {
    await store.saveReportTemplateLocal(style("Office A"));
    const j = await job();
    await store.saveResponsesLocal(j.id, j.items.map((it) => ({ itemId: it.id, status: "pass" })));
    const { snapshot } = await store.createReportSnapshotLocal({ assessmentId: j.id });
    await store.updateSnapshotNarrativeLocal(snapshot.id, { summary: "Fine." });
    await store.saveReportTemplateLocal(style("Office B"));
    await store.reapplyReportTemplateLocal(snapshot.id);
    const done = await store.finalizeSnapshotLocal(snapshot.id, undefined, reviewer);
    expect(done.finalized).toBe(true);
    expect(done.htmlPreview).toContain("Office B");
  });
});
