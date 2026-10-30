import { describe, it, expect } from "vitest";
import { computeCompleteness, type CompletenessInput } from "../completeness";

const base = (over: Partial<CompletenessInput> = {}): CompletenessInput => ({
  items: [
    { id: "a", title: "Roof", required: true },
    { id: "b", title: "Cabling", required: false },
  ],
  responses: [{ itemId: "a", status: "pass" }, { itemId: "b", status: "pass" }],
  evidenceItemIds: ["a"],
  findings: [],
  materials: null,
  quotations: [],
  clarificationAnswered: true,
  ...over,
});

describe("computeCompleteness", () => {
  it("is ready when every required item is checked and nothing awaits review", () => {
    const r = computeCompleteness(base());
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.counts.pass).toBe(2);
  });

  it("Not Checked is never Pass: a required item that was not checked blocks finalize", () => {
    const r = computeCompleteness(base({ responses: [{ itemId: "b", status: "pass" }] }));
    expect(r.ready).toBe(false);
    expect(r.blockers[0].code).toBe("required_not_checked");
    expect(r.counts.not_checked).toBe(1);
  });

  it("an optional unchecked item is only a warning", () => {
    const r = computeCompleteness(base({ responses: [{ itemId: "a", status: "pass" }] }));
    expect(r.ready).toBe(true);
    expect(r.warnings.some((w) => w.code === "optional_not_checked")).toBe(true);
  });

  it("unreviewed findings block finalize; confirmed/rejected do not", () => {
    expect(computeCompleteness(base({ findings: [{ status: "needs_review" }] })).ready).toBe(false);
    expect(computeCompleteness(base({ findings: [{ status: "confirmed" }, { status: "rejected" }] })).ready).toBe(true);
  });

  it("warns (does not block) about flagged items, passes without evidence, provisional materials and stale quotes", () => {
    const r = computeCompleteness(base({
      responses: [{ itemId: "a", status: "pass" }, { itemId: "b", status: "fail" }],
      evidenceItemIds: [],
      materials: { count: 3, provisionalCount: 2 },
      quotations: [{ stale: true }],
      clarificationAnswered: false,
    }));
    expect(r.ready).toBe(true);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["issue_flagged", "pass_without_evidence", "provisional_materials", "stale_quotation", "clarification_missing"]));
  });

  it("a missing materials list is allowed (report without materials)", () => {
    const r = computeCompleteness(base({ materials: null }));
    expect(r.ready).toBe(true);
    expect(r.warnings.some((w) => w.code === "no_materials")).toBe(true);
  });

  it("flags a measurement item that has no recorded value", () => {
    const r = computeCompleteness(base({ items: [{ id: "m", title: "Measurements — area", required: false }], responses: [{ itemId: "m", status: "pass" }], evidenceItemIds: [] }));
    expect(r.warnings.some((w) => w.code === "measurement_missing")).toBe(true);
  });
});
