import { describe, it, expect } from "vitest";
import { acceptAll, buildIntakeSummary, mergeIntake, startHereFor, type ChecklistItemLike, type IntakeResult } from "../intake";

const items: ChecklistItemLike[] = [
  { id: "i1", title: "Inverter — make, model, status", instructions: "Photograph the label.", required: true, category: "System", source: "established" },
  { id: "i2", title: "Orientation, tilt, shading survey", required: true, category: "System", source: "established" },
  { id: "i3", title: "My own item", required: false, source: "user" },
];
const result: IntakeResult = {
  startHere: { itemId: "i2", title: "Orientation, tilt, shading survey", reason: "A tree may shade the roof." },
  newItems: [
    { title: "Tree trimming and roof access", lookFor: "Note the tree distance.", why: "Tree in description", category: "Site" },
    { title: "Gate and access width", lookFor: "", why: "", category: null },
    { title: "orientation, tilt,  shading survey", lookFor: "dup", why: "", category: null },
  ],
  guidanceUpdates: [
    { itemId: "i2", lookFor: "Photograph the tree line." },
    { itemId: "i1", lookFor: "Read the display, then the label." },
  ],
  visible: ["A metal roof"],
  limitations: ["Roof strength is unknown"],
  uncertainty: "medium",
};

describe("applying a site intake to the checklist", () => {
  it("automatic mode adds new items at the end as AI suggestions and sharpens guidance, without touching anything else", () => {
    const out = mergeIntake(items, result, acceptAll(result), "ai_test");
    expect(out.added).toBe(2); // the third suggestion repeats an existing title
    expect(out.updated).toBe(2);
    expect(out.items.slice(0, 3).map((i) => i.id)).toEqual(["i1", "i2", "i3"]); // order and ids kept
    expect(out.items[0]).toMatchObject({ title: "Inverter — make, model, status", instructions: "Read the display, then the label.", required: true, source: "established" });
    expect(out.items[1].instructions).toBe("Photograph the tree line.");
    expect(out.items[2]).toEqual(items[2]);
    expect(out.items.slice(3)).toEqual([
      { id: "ai_test_0", title: "Tree trimming and roof access", instructions: "Note the tree distance.", required: false, category: "Site", source: "ai_suggested", rationale: "Tree in description" },
      { id: "ai_test_1", title: "Gate and access width", instructions: undefined, required: false, category: "AI suggested", source: "ai_suggested", rationale: undefined },
    ]);
  });

  it("review mode applies only what the person accepted", () => {
    const out = mergeIntake(items, result, { newItems: [1], guidanceUpdates: ["i2"] }, "ai_t");
    expect(out.added).toBe(1);
    expect(out.updated).toBe(1);
    expect(out.items.map((i) => i.title)).toEqual([...items.map((i) => i.title), "Gate and access width"]);
    expect(out.items[0].instructions).toBe("Photograph the label."); // i1's update was skipped
  });

  it("accepting nothing changes nothing, and the input list is not modified", () => {
    const before = JSON.stringify(items);
    const out = mergeIntake(items, result, { newItems: [], guidanceUpdates: [] });
    expect(out).toEqual({ items, added: 0, updated: 0 });
    expect(JSON.stringify(items)).toBe(before);
  });

  it("ignores positions and ids that do not exist, and never adds a title twice", () => {
    const out = mergeIntake(items, result, { newItems: [0, 0, 9, -1], guidanceUpdates: ["nope"] }, "ai_t");
    expect(out.added).toBe(1);
    expect(out.updated).toBe(0);
  });

  it("only ever adds or edits items: the result carries no statuses or answers", () => {
    const out = mergeIntake(items, result, acceptAll(result));
    for (const it of out.items) expect(Object.keys(it).filter((k) => /status|answer|pass|notes|measured/i.test(k))).toEqual([]);
  });
});

describe("the intake summary kept on the job", () => {
  it("keeps the text and evidence ids, caps lengths, and carries no photos", () => {
    const s = buildIntakeSummary({ description: "  " + "x".repeat(3000), result, mode: "review", evidenceIds: ["e1", "e2", "e3", "e4", "e5", "e6"], added: 1, updated: 2, now: new Date("2026-11-01T00:00:00Z") });
    expect(s.description).toHaveLength(2000);
    expect(s.evidenceIds).toHaveLength(5);
    expect(s).toMatchObject({ at: "2026-11-01T00:00:00.000Z", mode: "review", added: 1, updated: 2, visible: ["A metal roof"] });
    expect(JSON.stringify(s)).not.toMatch(/base64/i);
  });

  it("start-here uses the live checklist title when the item still exists and falls back to the stored title", () => {
    const s = { startHere: result.startHere };
    expect(startHereFor(s, [{ id: "i2", title: "Renamed item" }])).toEqual({ title: "Renamed item", reason: "A tree may shade the roof.", itemId: "i2" });
    expect(startHereFor(s, [])).toEqual({ title: "Orientation, tilt, shading survey", reason: "A tree may shade the roof.", itemId: null });
    expect(startHereFor(null, items)).toBeNull();
    expect(startHereFor({ startHere: { itemId: null, title: "", reason: "" } }, items)).toBeNull();
  });
});
