import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { draftSolarPlan, draftSolarWrite, SOLAR_PLAN_PROMPT, SOLAR_WRITE_PROMPT } from "../solarDraft";

// The solar design and sizing proposal (D-036): plan (loads and assumptions), then the write-up around the app's sizing.

const fetchMock = vi.fn();
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 600, total_tokens: 1500 } }), { status: 200 });

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

const job = {
  workspaceId: "w",
  assessmentId: "a1",
  siteName: "Palm Road house",
  mode: "assessment" as const,
  pack: "solar" as const,
  scenario: "new_install" as const,
  checklist: [{ title: "Load audit — demand & operating hours", status: "pass", notes: "2 ACs about 6 h, fridge, lights" }],
  findings: [],
  measurements: [],
  limitations: [],
  siteBrief: { goal: "Backup during outages" },
  photos: [{ id: "p1", itemTitle: "Load audit — demand & operating hours", caption: "Split AC outdoor unit.", observations: ["Label reading - Rated input power: 1000 W"], possibleIssues: [], cannotTell: [] }],
};

const sv = (value: number, basis = "assumption") => ({ value, basis, note: "" });
const planAnswer = (over: Record<string, unknown> = {}) => ({
  basis: [{ item: "System type", decision: "Hybrid for backup", basis: "client" }],
  loads: [{ name: "Split AC", quantity: 2, watts: 1000, hours_per_day: 6, source: "label", motor: true, note: "From the photo label" }],
  inputs: { system_type: "hybrid", peak_sun_hours: sv(5), system_losses: sv(0.25), panel_watts: sv(550), battery_voltage: sv(48), depth_of_discharge: sv(0.8), autonomy_days: sv(1), simultaneity: sv(0.7) },
  placement: ["Right-hand slope"],
  ...over,
});

const sent = () => {
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string } } };
  return { system: body.messages.find((m) => m.role === "system")!.content, user: JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown>, body };
};

describe("solar step 1: loads and assumptions", () => {
  it("sends the record with the label readings and asks for the plan schema", async () => {
    fetchMock.mockResolvedValue(chat(planAnswer()));
    await draftSolarPlan(job);
    const { user, body } = sent();
    expect(user.task).toBe("draftSolarPlan");
    expect(JSON.stringify(user.photoNotes)).toContain("Label reading - Rated input power: 1000 W");
    expect(body.response_format?.json_schema?.name).toBe("solar_plan");
  });

  it("returns loads and inputs in the app's field names", async () => {
    fetchMock.mockResolvedValue(chat(planAnswer()));
    const { plan } = await draftSolarPlan(job);
    expect(plan.loads).toEqual([{ name: "Split AC", quantity: 2, watts: 1000, hoursPerDay: 6, source: "label", motor: true, note: "From the photo label" }]);
    expect(plan.inputs).toMatchObject({ systemType: "hybrid", peakSunHours: sv(5), autonomyDays: sv(1) });
  });

  it("refuses a plan with no loads", async () => {
    fetchMock.mockResolvedValue(chat(planAnswer({ loads: [] })));
    await expect(draftSolarPlan(job)).rejects.toThrow(/did not list any loads/);
  });
});

describe("solar step 2: the write-up around the sizing", () => {
  const writeAnswer = (over: Record<string, unknown> = {}) => ({
    summary: "A 4.4 kWp hybrid system with a 22.4 kWh battery.",
    site_overview: "A single-storey house.",
    options: [{ area: "Battery", gap: "Back up essentials only", option: "Smaller battery" }],
    equipment: [{ item: "Mounting rails", quantity: "to be sized after the survey", specification: "" }],
    installation: ["Survey"],
    open_items: [{ item: "Sun hours", status: "To be confirmed" }],
    next_steps: ["Confirm loads"],
    missing_information: [],
    assumptions: [],
    ...over,
  });

  it("sends the plan and the app's sizing, and does not flag figures that come from the sizing", async () => {
    fetchMock.mockResolvedValue(chat(writeAnswer()));
    const out = await draftSolarWrite(job, { loads: [] }, { array: "8 panels of 550 W, 4.4 kWp", battery: "22.4 kWh at 48 V" });
    const { user, body } = sent();
    expect(user.task).toBe("draftSolarWrite");
    expect(user.sizing).toEqual({ array: "8 panels of 550 W, 4.4 kWp", battery: "22.4 kWh at 48 V" });
    expect(body.response_format?.json_schema?.name).toBe("solar_write");
    expect(out.unverifiedFigures).toEqual([]);
    expect(out.rest.openItems).toEqual([{ item: "Sun hours", status: "To be confirmed" }]);
  });

  it("flags a size the model made up", async () => {
    fetchMock.mockResolvedValue(chat(writeAnswer({ summary: "A 7.5 kWp system." })));
    expect((await draftSolarWrite(job, {}, { array: "4.4 kWp" })).unverifiedFigures).toEqual(["7.5 kWp"]);
  });
});

describe("solar guard rails", () => {
  it("the plan uses label readings first, never treats BTU/h as electrical power, and leaves all arithmetic to the app", () => {
    expect(SOLAR_PLAN_PROMPT).toMatch(/Label reading/);
    expect(SOLAR_PLAN_PROMPT).toMatch(/BTU\/h is NOT the electrical power/);
    expect(SOLAR_PLAN_PROMPT).toMatch(/Do NOT calculate/);
    expect(SOLAR_PLAN_PROMPT).toMatch(/never invent an appliance/);
  });

  it("the write-up uses the app's sizes exactly and lists every typical or assumed figure as open", () => {
    expect(SOLAR_WRITE_PROMPT).toMatch(/SETTLED/);
    expect(SOLAR_WRITE_PROMPT).toMatch(/use the sizes exactly as given/);
    expect(SOLAR_WRITE_PROMPT).toMatch(/every load whose source is typical or assumption/);
    for (const p of [SOLAR_PLAN_PROMPT, SOLAR_WRITE_PROMPT]) expect(p).toMatch(/no prices/);
  });
});
