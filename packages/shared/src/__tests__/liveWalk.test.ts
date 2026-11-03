import { describe, it, expect } from "vitest";
import { startIndex, stepIndex, summarizeWalk, walkProgress, type WalkItem } from "../liveWalk";

const items: WalkItem[] = [
  { id: "a", title: "Site access" },
  { id: "b", title: "Inverter" },
  { id: "c", title: "Roof" },
  { id: "d", title: "Limitations" },
];

describe("where the walk starts", () => {
  it("at the Start here item when it is on the list", () => {
    expect(startIndex(items, {}, "c")).toBe(2);
  });
  it("otherwise at the first item that is not checked", () => {
    expect(startIndex(items, { a: "pass", b: "fail" }, null)).toBe(2);
    expect(startIndex(items, { a: "pass", b: "not_checked" }, undefined)).toBe(1);
  });
  it("ignores a Start here item that is no longer on the list", () => {
    expect(startIndex(items, { a: "pass" }, "gone")).toBe(1);
  });
  it("begins at the first item when everything is marked, and at nothing for an empty list", () => {
    expect(startIndex(items, { a: "pass", b: "pass", c: "pass", d: "pass" })).toBe(0);
    expect(startIndex([], {})).toBe(-1);
  });
});

describe("moving between items", () => {
  it("steps forward and back and stops at the ends", () => {
    expect(stepIndex(4, 1, 1)).toBe(2);
    expect(stepIndex(4, 1, -1)).toBe(0);
    expect(stepIndex(4, 0, -1)).toBe(0);
    expect(stepIndex(4, 3, 1)).toBe(3);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});

describe("progress", () => {
  it("counts items with an answer; Not Checked and missing do not count", () => {
    expect(walkProgress(items, { a: "pass", b: "not_checked", c: "needs_attention" })).toEqual({ marked: 2, total: 4 });
    expect(walkProgress(items, {})).toEqual({ marked: 0, total: 4 });
    expect(walkProgress(items, { a: "not_applicable" }).marked).toBe(1);
  });
});

describe("the finish summary", () => {
  it("gives one row per item and lists what is still unmarked", () => {
    const s = summarizeWalk({ items, statuses: { a: "pass", c: "fail" }, picturesByItem: { a: 2, c: 1 }, piecesByItem: { b: 3 } });
    expect(s.rows).toEqual([
      { id: "a", title: "Site access", status: "pass", pictures: 2, pieces: 0 },
      { id: "b", title: "Inverter", status: "not_checked", pictures: 0, pieces: 3 },
      { id: "c", title: "Roof", status: "fail", pictures: 1, pieces: 0 },
      { id: "d", title: "Limitations", status: "not_checked", pictures: 0, pieces: 0 },
    ]);
    expect(s.unmarked).toEqual(["Inverter", "Limitations"]);
  });
  it("counts pictures and narration that belong to no listed item separately, and never invents a status", () => {
    const s = summarizeWalk({ items, statuses: {}, picturesByItem: { "": 4, zzz: 1 }, piecesByItem: { "": 2 } });
    expect(s.extraPictures).toBe(5);
    expect(s.extraPieces).toBe(2);
    expect(s.rows.every((r) => r.status === "not_checked")).toBe(true);
    expect(s.unmarked).toHaveLength(4);
  });
});
