import { describe, it, expect } from "vitest";
import { ProposeMaterialsInput } from "../schemas";
import type { MaterialsProposal } from "../materialsDraft";
import { MATERIALS_CASES, checkMaterials } from "./fixtures/materialsCases";

// Offline: the evaluation set is well formed, and the automated checks catch the faults they are meant to catch.
// The live run (materialsEval.live.test.ts) is skipped unless asked for, because it calls the real model.

const item = (over: Partial<MaterialsProposal["items"][number]> = {}): MaterialsProposal["items"][number] => ({
  group: "Modules",
  description: "Solar modules",
  specification: "Monocrystalline module class, to be confirmed by the designer",
  method: "rule",
  ruleId: "pv_modules_by_target",
  ruleInputs: [{ name: "targetKw", value: 5, from: "record" }],
  unit: "pcs",
  rationale: "The client wants 5 kW.",
  assumptions: ["Module rating assumed"],
  basis: [],
  ...over,
});
const proposal = (items: MaterialsProposal["items"]): MaterialsProposal => ({ designBasis: "A 5 kW grid-tied rooftop array is assumed from the goal given by the client.", missingInputs: [], assumptions: [], items, duplicates: [], dropped: [], unverifiedFigures: [], requiresHumanReview: true });

describe("materials evaluation set", () => {
  it("every case is valid input for the materials proposal, with unique ids", () => {
    expect(new Set(MATERIALS_CASES.map((c) => c.id)).size).toBe(MATERIALS_CASES.length);
    for (const c of MATERIALS_CASES) expect(() => ProposeMaterialsInput.parse(c.input), c.id).not.toThrow();
  });

  it("covers solar and CCTV, new and existing", () => {
    const has = (pack: string, existing: boolean) => MATERIALS_CASES.some((c) => c.input.pack === pack && c.existing === existing);
    expect(has("solar", false) && has("solar", true) && has("cctv", false) && has("cctv", true)).toBe(true);
  });
});

describe("materials automated checks", () => {
  const solarNew = MATERIALS_CASES[0];
  const solarExisting = MATERIALS_CASES[1];

  it("accepts a clean proposal", () => {
    expect(checkMaterials(solarNew, proposal([item()])).problems).toEqual([]);
  });

  it("catches a price, a brand and a model number", () => {
    const r = checkMaterials(solarNew, proposal([item({ rationale: "About $1,200 each." }), item({ description: "Camera", specification: "Hikvision dome" }), item({ description: "Panel", specification: "Module ABC-4500X" })]));
    expect(r.problems.join("\n")).toMatch(/price or cost/);
    expect(r.problems.join("\n")).toMatch(/brand is named/);
    expect(r.problems.join("\n")).toMatch(/model or part number/);
  });

  it("catches a rating invented for an item that needs sizing, and a missing 'to be sized'", () => {
    const r = checkMaterials(solarNew, proposal([item({ description: "AC breaker", specification: "32 A breaker, to be confirmed" }), item({ description: "Inverter", specification: "String inverter class" })]));
    expect(r.problems.join("\n")).toMatch(/rating was given/);
    expect(r.problems.join("\n")).toMatch(/does not say it is to be sized/);
  });

  it("catches a record figure that is not in the record, an unknown rule, and an estimate with no assumption", () => {
    const r = checkMaterials(solarNew, proposal([item({ ruleInputs: [{ name: "targetKw", value: 9, from: "record" }] }), item({ description: "B", ruleId: "magic" }), item({ description: "C", method: "estimate", ruleId: undefined, ruleInputs: [], assumptions: [] })]));
    expect(r.problems.join("\n")).toMatch(/but it is not/);
    expect(r.problems.join("\n")).toMatch(/rule that does not exist/);
    expect(r.problems.join("\n")).toMatch(/estimate has no assumption/);
  });

  it("for an existing system, wants every item tied to the record and not a whole new system", () => {
    const r = checkMaterials(solarExisting, proposal(Array.from({ length: 13 }, (_, n) => item({ description: `Part ${n}`, method: "unknown", ruleId: undefined, ruleInputs: [] }))));
    expect(r.problems.join("\n")).toMatch(/not tied to any finding/);
    expect(r.problems.join("\n")).toMatch(/whole new system/);
  });
});
