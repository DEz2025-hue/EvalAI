import { describe, it, expect, vi, beforeEach } from "vitest";

const proposeMaterials = vi.fn();
vi.mock("@eval-ai/ai-adapter", async (orig) => {
  const real = await orig<typeof import("@eval-ai/ai-adapter")>();
  return { ...real, proposeMaterials: (...a: unknown[]) => proposeMaterials(...a) };
});
vi.mock("../auth", () => ({ requireWriter: async () => ({ auth: { mode: "demo", ctx: {} } }) }));
const loadFacts = vi.fn();
vi.mock("../aiRoute", async (orig) => {
  const real = await orig<typeof import("../aiRoute")>();
  return { ...real, aiGuard: async () => null, aiRunHook: () => undefined, loadAssessmentFacts: (...a: unknown[]) => loadFacts(...a) };
});
const buildInput = vi.fn();
const saveMaterials = vi.fn();
vi.mock("../store", () => ({
  buildReportInputFromStoredFacts: (...a: unknown[]) => buildInput(...a),
  listEvidenceLocal: async () => ({ items: [] }),
  listFindingsLocal: async () => [{ status: "confirmed" }, { status: "needs_review", title: "SECRET UNCONFIRMED TEXT" }],
  getMaterialsLocal: async () => [{ description: "Mounting rail", specification: "Aluminium rail class", version: 3 }],
  saveMaterialsLocal: (...a: unknown[]) => saveMaterials(...a),
}));
vi.mock("../reportPhotos", () => ({ buildReportPhotos: async () => [] }));

import { POST } from "../../app/api/ai/materials/route";
import { resolveMaterialsProposal } from "../materialsDraft";
import { QUANTITY_TBD } from "@eval-ai/shared";

const call = (body: unknown) => POST(new Request("http://x/api/ai/materials", { method: "POST", body: JSON.stringify(body) }));

const proposed = (over: Record<string, unknown> = {}) => ({
  group: "Modules",
  description: "Solar modules",
  specification: "450 W class module, to be confirmed",
  method: "rule" as const,
  ruleId: "pv_modules_by_target",
  ruleInputs: [{ name: "targetKw", value: 5, from: "record" as const }],
  unit: "pcs",
  rationale: "The client wants 5 kW.",
  assumptions: [],
  basis: [],
  ...over,
});
const proposal = (items: unknown[], over: Record<string, unknown> = {}) => ({ designBasis: "Basis", missingInputs: ["Roof area"], assumptions: [], items, duplicates: [], dropped: [], unverifiedFigures: [], requiresHumanReview: true as const, ...over });

describe("resolveMaterialsProposal: quantities come from code", () => {
  it("runs the rule, marks assumed inputs, and keeps the explanation for traceability", () => {
    const d = resolveMaterialsProposal(proposal([proposed()]) as never);
    const it = d.items[0];
    expect(it).toMatchObject({ quantity: 12, unit: "pcs", source: "ai_suggested", quantityTbd: false, method: "rule" });
    expect(it.provisional).toBe(true); // the 450 W module rating was not recorded
    expect(it.assumptions.join(" ")).toMatch(/Assumed module rating/i);
    expect(it.rationale).toContain("rule pv_modules_by_target v1");
  });

  it("a rule that ran entirely on recorded values is not provisional", () => {
    const d = resolveMaterialsProposal(
      proposal([proposed({ ruleInputs: [{ name: "targetKw", value: 5, from: "record" }, { name: "moduleW", value: 500, from: "record" }] })]) as never,
    );
    expect(d.items[0]).toMatchObject({ quantity: 10, provisional: false });
  });

  it("a rule that cannot run becomes TBD, says what is missing, and adds it to the missing inputs", () => {
    const d = resolveMaterialsProposal(proposal([proposed({ description: "DC cable", ruleId: "cable_run", ruleInputs: [], unit: "m" })]) as never);
    expect(d.items[0]).toMatchObject({ quantity: 1, quantityTbd: true, provisional: true, method: "unknown" });
    expect(d.items[0].assumptions.some((a) => a.startsWith(QUANTITY_TBD))).toBe(true);
    expect(d.missingInputs.some((m) => m.includes("Measured run length") && m.includes("DC cable"))).toBe(true);
    expect(d.missingInputs).toContain("Roof area");
  });

  it("an estimate is always provisional and says so; an unknown quantity is TBD", () => {
    const d = resolveMaterialsProposal(
      proposal([proposed({ description: "Labels", method: "estimate", ruleId: undefined, ruleInputs: [], estimate: 10, unit: "pcs", assumptions: ["One per cable end"] }), proposed({ description: "Conduit", method: "unknown", ruleId: undefined, ruleInputs: [], unit: "" })]) as never,
    );
    expect(d.items[0]).toMatchObject({ quantity: 10, provisional: true, quantityTbd: false });
    expect(d.items[0].assumptions.join(" ")).toMatch(/AI estimate, not calculated/);
    expect(d.items[1]).toMatchObject({ quantity: 1, unit: "pcs", quantityTbd: true, provisional: true });
  });

  it("an AI draft always satisfies the materials route limits", () => {
    const long = "x".repeat(900);
    const d = resolveMaterialsProposal(proposal([proposed({ rationale: long, assumptions: [long] })]) as never);
    expect(d.items[0].rationale.length).toBeLessThanOrEqual(1000);
    expect(d.items[0].assumptions.every((a) => a.length <= 500)).toBe(true);
  });
});

describe("POST /api/ai/materials", () => {
  beforeEach(() => {
    for (const m of [proposeMaterials, loadFacts, buildInput, saveMaterials]) m.mockReset();
    loadFacts.mockResolvedValue({ assessment: { context: {} }, scenario: "new_install", items: [{ id: "i1", title: "Roof", instructions: "Look at the roof." }], responses: [], evidenceIds: [] });
    buildInput.mockResolvedValue({
      input: {
        siteName: "Hillside School",
        mode: "assessment",
        pack: "solar",
        context: { goal: "A 5 kW array" },
        siteBrief: { goal: "A 5 kW array" },
        checklist: [{ title: "Roof", status: "needs_attention", notes: "Rust", category: "Site", required: true }],
        findings: [{ title: "Rust", severity: "low", description: "Surface rust" }],
        measurements: [{ name: "Roof area", value: 40, unit: "m²" }],
        limitations: [],
        materials: [],
      },
    });
    proposeMaterials.mockResolvedValue(proposal([proposed()]));
  });

  it("sends the whole record, the existing list and the rules, and counts (never describes) unconfirmed findings", async () => {
    const res = await call({ assessmentId: "job-1" });
    expect(res.status).toBe(200);
    const sent = proposeMaterials.mock.calls[0][0];
    expect(sent.goal).toBe("A 5 kW array");
    expect(sent.scenario).toBe("new_install");
    expect(sent.checklist[0]).toMatchObject({ title: "Roof", covers: "Look at the roof." });
    expect(sent.measurements).toEqual([{ name: "Roof area", value: 40, unit: "m²" }]);
    expect(sent.existingMaterials).toEqual([{ description: "Mounting rail", specification: "Aluminium rail class" }]);
    expect(sent.rules.map((r: { id: string }) => r.id)).toContain("cable_run");
    expect(sent.findingsAwaitingReview).toBe(1);
    expect(JSON.stringify(sent)).not.toContain("SECRET UNCONFIRMED TEXT");
  });

  it("returns a draft with calculated quantities and saves nothing", async () => {
    const out = await (await call({ assessmentId: "job-1" })).json();
    expect(out).toMatchObject({ draft: true, designBasis: "Basis", existingCount: 1 });
    expect(out.items[0]).toMatchObject({ quantity: 12, source: "ai_suggested" });
    expect(out.label).toMatch(/Not a quotation/);
    expect(saveMaterials).not.toHaveBeenCalled();
  });

  it("rejects a bad request and maps a provider failure", async () => {
    expect((await call({})).status).toBe(400);
    proposeMaterials.mockRejectedValue(new Error("boom"));
    const res = await call({ assessmentId: "job-1" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
