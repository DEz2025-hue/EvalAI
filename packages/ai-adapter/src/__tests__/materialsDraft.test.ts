import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { proposeMaterials, cleanMaterials, MATERIALS_ANALYST_PROMPT, MATERIALS_LIMITS } from "../materialsDraft";

const fetchMock = vi.fn();
const chat = (content: unknown, finish = "stop") => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: finish }], usage: { prompt_tokens: 900, completion_tokens: 600, total_tokens: 1500 } }), { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.AI_PROVIDER_API_KEY = "test-key-1234567890";
  process.env.AI_PROVIDER_BASE_URL = "https://api.meta.ai";
  for (const k of Object.keys(process.env)) if (/^(META_|AI_PROVIDER$|AI_MODEL_|AI_EFFORT_|AI_MAX_TOKENS_)/.test(k)) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// A trimmed copy of the shared rule catalog (the adapter does not depend on the shared package).
const rules = [
  { id: "pv_modules_by_target", label: "Solar modules to reach a target size", unit: "pcs", formula: "f", inputs: [{ name: "targetKw", label: "Target", unit: "kW", kind: "record", min: 0.1, max: 1000 }, { name: "moduleW", label: "Module", unit: "W", kind: "assumption", default: 450, min: 100, max: 800 }] },
  { id: "cable_run", label: "Cable", unit: "m", formula: "f", inputs: [{ name: "runLengthM", label: "Run", unit: "m", kind: "measurement", min: 0.5, max: 10000 }] },
];

const job = {
  workspaceId: "w",
  assessmentId: "a1",
  siteName: "Hillside School",
  mode: "assessment" as const,
  pack: "solar" as const,
  scenario: "new_install" as const,
  goal: "A 5 kW rooftop array",
  checklist: [
    { title: "Orientation, tilt, shading survey", status: "needs_attention", notes: "tree NW", category: "Site", required: true },
    { title: "Load audit", status: "not_checked", category: "Customer", required: true },
  ],
  findings: [{ title: "Missing earth strap", severity: "high", description: "No earth strap seen." }],
  findingsAwaitingReview: 1,
  measurements: [{ name: "Inverter to board run", value: 18, unit: "m" }, { name: "Roof area", value: 42.5, unit: "m²" }],
  limitations: [],
  photos: [],
  existingMaterials: [{ description: "Mounting rail" }],
  rules,
};

const item = (over: Record<string, unknown> = {}) => ({
  group: "Modules",
  description: "Solar modules",
  specification: "Monocrystalline module, 450 W class, to be confirmed by the designer",
  quantity_method: "rule",
  rule_id: "pv_modules_by_target",
  rule_inputs: [{ name: "targetKw", value: 5, source: "record", measurement_name: "" }],
  estimate_quantity: 0,
  unit: "pcs",
  rationale: "The client wants a 5 kW array on the roof.",
  assumptions: ["Module rating assumed 450 W class"],
  item_titles: [],
  finding_titles: [],
  measurement_names: [],
  ...over,
});

const answer = (over: Record<string, unknown> = {}) => ({ design_basis: "A 5 kW grid-tied rooftop array is assumed from the goal.", missing_inputs: ["Cable route length"], assumptions: [], items: [item()], ...over });

const sent = () => {
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }> };
  return { system: body.messages.find((m) => m.role === "system")!.content, user: JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown> };
};

describe("materials proposal: what the model is given", () => {
  it("sends the whole record, the existing list and the rules as data", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    await proposeMaterials(job);
    const { user } = sent();
    expect(user.task).toBe("proposeMaterials");
    expect(user.goal).toBe("A 5 kW rooftop array");
    expect(JSON.stringify(user.measurements)).toContain("Inverter to board run");
    expect(JSON.stringify(user.existingMaterials)).toContain("Mounting rail");
    expect(JSON.stringify(user.rules)).toContain("pv_modules_by_target");
    expect(JSON.stringify(user.confirmedFindings)).toContain("Missing earth strap");
    expect(user.situation).toMatch(/NEW INSTALLATION/);
  });

  it("has the guard rails in the prompt", () => {
    expect(MATERIALS_ANALYST_PROMPT).toMatch(/Never give a brand, model, manufacturer or part number, and never give a price/);
    expect(MATERIALS_ANALYST_PROMPT).toMatch(/to be sized by a qualified designer/);
    expect(MATERIALS_ANALYST_PROMPT).toMatch(/You do NOT calculate the quantity: code does that/);
    expect(MATERIALS_ANALYST_PROMPT).toMatch(/Prefer 'unknown' to a guess/);
    expect(MATERIALS_ANALYST_PROMPT).toMatch(/UNVERIFIED/);
  });
});

describe("materials proposal: what comes back is checked", () => {
  it("keeps a rule item with the record input and drops any number of the model's own", async () => {
    fetchMock.mockResolvedValue(chat(answer({ items: [item({ estimate_quantity: 99 })] })));
    const r = await proposeMaterials(job);
    expect(r.items[0]).toMatchObject({ method: "rule", ruleId: "pv_modules_by_target", unit: "pcs" });
    expect(r.items[0].estimate).toBeUndefined();
    expect(r.items[0].ruleInputs).toEqual([{ name: "targetKw", value: 5, from: "record" }]);
    expect(r.requiresHumanReview).toBe(true);
  });

  it("replaces a measurement input with the recorded value, even if the model copied it wrongly", async () => {
    const cable = item({ description: "DC cable", rule_id: "cable_run", rule_inputs: [{ name: "runLengthM", value: 25, source: "measurement", measurement_name: "inverter to board run" }] });
    fetchMock.mockResolvedValue(chat(answer({ items: [cable] })));
    const r = await proposeMaterials(job);
    expect(r.items[0].ruleInputs).toEqual([{ name: "runLengthM", value: 18, from: "record", measurement: "Inverter to board run" }]);
  });

  it("a measurement that does not exist, or has the wrong unit, becomes an assumption", async () => {
    const fake = item({ description: "DC cable", rule_id: "cable_run", rule_inputs: [{ name: "runLengthM", value: 30, source: "measurement", measurement_name: "Imaginary run" }] });
    const wrongUnit = item({ description: "AC cable", rule_id: "cable_run", rule_inputs: [{ name: "runLengthM", value: 30, source: "measurement", measurement_name: "Roof area" }] });
    fetchMock.mockResolvedValue(chat(answer({ items: [fake, wrongUnit] })));
    const r = await proposeMaterials(job);
    expect(r.items[0].ruleInputs).toEqual([{ name: "runLengthM", value: 30, from: "assumed" }]);
    expect(r.items[1].ruleInputs).toEqual([{ name: "runLengthM", value: 30, from: "assumed" }]);
  });

  it("a figure said to be from the record but not in it becomes an assumption", async () => {
    const r = await proposeMaterials(job).catch(() => null);
    expect(r).toBeNull(); // no mock set yet: sanity check that a call is needed
    fetchMock.mockResolvedValue(chat(answer({ items: [item({ rule_inputs: [{ name: "targetKw", value: 8, source: "record", measurement_name: "" }] })] })));
    const ok = await proposeMaterials(job);
    expect(ok.items[0].ruleInputs).toEqual([{ name: "targetKw", value: 8, from: "assumed" }]);
  });

  it("an unknown input name is ignored, and an unknown rule id falls back to estimate or unknown", async () => {
    const odd = item({ rule_inputs: [{ name: "bogus", value: 3, source: "record", measurement_name: "" }] });
    const noRule = item({ description: "Clamps", rule_id: "made_up", estimate_quantity: 48, unit: "pcs" });
    const noRuleNoNumber = item({ description: "Labels", rule_id: "made_up", estimate_quantity: 0, unit: "" });
    fetchMock.mockResolvedValue(chat(answer({ items: [odd, noRule, noRuleNoNumber] })));
    const r = await proposeMaterials(job);
    expect(r.items[0].ruleInputs).toEqual([]);
    expect(r.items[1]).toMatchObject({ method: "estimate", estimate: 48, unit: "pcs" });
    expect(r.items[2]).toMatchObject({ method: "unknown", unit: "pcs" });
  });

  it("drops items already on the list, repeats within the answer, and items with no description or reason", async () => {
    fetchMock.mockResolvedValue(chat(answer({ items: [item({ description: "Mounting rail", rule_id: "", quantity_method: "unknown" }), item(), item(), item({ description: "", }), item({ description: "Inverter", rationale: "" })] })));
    const r = await proposeMaterials(job);
    expect(r.items.map((i) => i.description)).toEqual(["Solar modules"]);
    expect(r.duplicates).toEqual(["Mounting rail", "Solar modules"]);
    expect(r.dropped.length).toBe(2);
  });

  it("removes a price or a model number from a specification, and keeps a general class", async () => {
    const priced = item({ description: "Inverter", specification: "String inverter, about $1,200", quantity_method: "unknown" });
    const model = item({ description: "Camera", specification: "Dome camera XYZ-4500X", quantity_method: "unknown" });
    const general = item({ description: "Breaker", specification: "AC isolator, to be sized by a qualified designer", quantity_method: "unknown" });
    fetchMock.mockResolvedValue(chat(answer({ items: [priced, model, general] })));
    const r = await proposeMaterials(job);
    expect(r.items.map((i) => i.specification)).toEqual(["", "", "AC isolator, to be sized by a qualified designer"]);
  });

  it("keeps only supports that really exist in the record", async () => {
    const it1 = item({ item_titles: ["Orientation, tilt, shading survey", "Invented checklist item"], finding_titles: ["missing earth strap", "Invented finding"], measurement_names: ["Roof area", "Invented"] });
    fetchMock.mockResolvedValue(chat(answer({ items: [it1] })));
    const r = await proposeMaterials(job);
    expect(r.items[0].basis).toEqual([
      { kind: "item", ref: "Orientation, tilt, shading survey" },
      { kind: "finding", ref: "Missing earth strap" },
      { kind: "measurement", ref: "Roof area" },
    ]);
  });

  it("flags figures in the written text that are not in the record", async () => {
    fetchMock.mockResolvedValue(chat(answer({ design_basis: "A 5 kW array on the roof. The roof is 25 years old.", items: [item({ rationale: "Needed for 8 kW of output." })] })));
    const r = await proposeMaterials(job);
    expect(r.unverifiedFigures).toContain("25 years");
    expect(r.unverifiedFigures).toContain("8 kW");
    expect(r.unverifiedFigures).not.toContain("5 kW");
  });

  it("caps the number of items and the length of text", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...item({ description: `Part ${i}`, quantity_method: "unknown", rationale: "x".repeat(2000) }) }));
    const { items } = cleanMaterials(many, { rules, checklistTitles: [], findingTitles: [], measurements: [], recordNumbers: new Set(), existing: [] });
    expect(items.length).toBe(MATERIALS_LIMITS.items);
    expect(items[0].rationale.length).toBeLessThanOrEqual(MATERIALS_LIMITS.rationale);
  });

  it("refuses an answer with nothing in it", async () => {
    fetchMock.mockResolvedValue(chat({ design_basis: "  ", missing_inputs: [], assumptions: [], items: [] }));
    await expect(proposeMaterials(job)).rejects.toThrow(/did not produce a materials proposal/);
  });
});
