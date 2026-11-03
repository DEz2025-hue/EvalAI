import { describe, it, expect } from "vitest";
import { downloadGate, previewKey, type GateSnapshot } from "../reportGate";

const draft = (over: Partial<GateSnapshot> = {}): GateSnapshot => ({ id: "s1", finalized: false, payload: { narrative: { summary: "A", recommendations: "B", notes: "" }, photos: [{ evidenceId: "e1" }, { evidenceId: "e2" }] }, ...over });

describe("download gate for drafts (D-024)", () => {
  it("a draft is locked until it has been previewed", () => {
    const g = downloadGate(draft(), null);
    expect(g.locked).toBe(true);
    expect(g.reason).toMatch(/Preview the report first/);
  });

  it("is unlocked once this exact version was previewed", () => {
    const d = draft();
    expect(downloadGate(d, previewKey(d))).toEqual({ locked: false, reason: null });
  });

  it("locks again after any change: edited text, a removed photo, or a rebuild (new draft)", () => {
    const d = draft();
    const seen = previewKey(d);
    const edited = draft({ payload: { ...d.payload, narrative: { ...d.payload!.narrative, summary: "A, better" } } });
    const removed = draft({ payload: { ...d.payload, photos: [{ evidenceId: "e1" }] } });
    const rebuilt = draft({ id: "s2" });
    for (const changed of [edited, removed, rebuilt]) expect(downloadGate(changed, seen).locked).toBe(true);
    expect(downloadGate(edited, seen).reason).toMatch(/changed the draft/);
    expect(downloadGate(rebuilt, seen).reason).toMatch(/Preview the report first/);
  });

  it("a finalized report can always be downloaded, and no report means locked", () => {
    expect(downloadGate(draft({ finalized: true }), null).locked).toBe(false);
    expect(downloadGate(null, null).locked).toBe(true);
    expect(downloadGate(undefined, "x").locked).toBe(true);
  });

  it("the key ignores things that do not change the document and tolerates missing parts", () => {
    expect(previewKey(draft())).toBe(previewKey(draft()));
    expect(previewKey({ id: "s9", finalized: false })).toMatch(/^s9:/);
    expect(previewKey(draft({ payload: {} }))).not.toBe(previewKey(draft()));
  });
});
