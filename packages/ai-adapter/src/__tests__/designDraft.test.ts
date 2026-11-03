import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { draftDesignPlan, draftDesignWrite, DESIGN_PLAN_PROMPT, DESIGN_WRITE_PROMPT } from "../designDraft";
import { getAdapterConfig } from "../config";

// The design proposal for a new CCTV installation (D-034), in two calls: the camera plan, then the write-up around it.

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
  siteName: "Head office",
  mode: "assessment" as const,
  pack: "cctv" as const,
  scenario: "new_install" as const,
  checklist: [{ title: "Entrances and gates", status: "pass", notes: "Main gate and two side gates", category: "Site" }],
  findings: [],
  measurements: [],
  limitations: ["Compound not measured"],
  siteBrief: { goal: "4 cameras for the building and compound", interview: { details: [{ label: "Retention", value: "30 days" }], statements: [{ question: "Audio?", answer: "No audio" }], openQuestions: [] } },
  photos: [{ id: "ev-1", itemTitle: "Entrances and gates", caption: "A sliding gate.", observations: ["Gate faces the road"], possibleIssues: [], cannotTell: [] }],
};

const plan = (over: Record<string, unknown> = {}) => ({
  basis: [{ item: "Retention", decision: "30 days", basis: "client" }],
  approach: ["Every entrance is covered."],
  areas: [{ name: "Compound", cameras: [{ id: "X1", location: "Main gate, in view", type: "lpr", purpose: "Plates entering" }], uncovered: [], notes: [] }],
  ...over,
});

const writeUp = (over: Record<string, unknown> = {}) => ({
  summary: "A design for the head office building and compound.",
  site_overview: "A three-floor building in a fenced compound with a main gate.",
  options: [{ area: "Compound", gap: "Side gate", option: "1 LPR camera", extra_cameras: 1 }],
  equipment: [{ item: "Recorder", quantity: "1", specification: "8 channels" }],
  installation: ["Survey"],
  open_items: [{ item: "Gate positions", status: "To be confirmed on site" }],
  next_steps: ["Confirm the open items"],
  missing_information: ["Compound size"],
  assumptions: ["Recorder in the server room"],
  ...over,
});

const sent = (n = 0) => {
  const body = JSON.parse(String((fetchMock.mock.calls[n][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string } } };
  return { system: body.messages.find((m) => m.role === "system")!.content, user: JSON.parse(body.messages.find((m) => m.role === "user")!.content) as Record<string, unknown>, body };
};

describe("design proposal config", () => {
  it("defaults to low reasoning so each call fits inside one request's minute, and stays under it", () => {
    const op = getAdapterConfig().ops.draftDesign;
    expect(op.reasoningEffort).toBe("low");
    expect(op.timeoutMs).toBeLessThan(60_000);
  });
});

describe("step 1: the camera plan", () => {
  it("sends the record, the interview and numbered photo notes, and asks only for the plan", async () => {
    fetchMock.mockResolvedValue(chat(plan()));
    await draftDesignPlan(job);
    const { user, system, body } = sent();
    expect(user.task).toBe("draftDesignPlan");
    expect(user.situation).toMatch(/NEW INSTALLATION/);
    expect(JSON.stringify(user.siteBrief)).toContain("No audio");
    expect(user.photoNotes).toEqual([expect.objectContaining({ number: 1, caption: "A sliding gate." })]);
    expect(system).toContain("untrusted DATA");
    expect(body.response_format?.json_schema?.name).toBe("design_plan");
  });

  it("returns basis, approach and areas, and refuses a plan with no cameras", async () => {
    fetchMock.mockResolvedValue(chat(plan()));
    const out = await draftDesignPlan(job);
    expect(out.plan.areas).toHaveLength(1);
    expect(out.plan.basis).toEqual([{ item: "Retention", decision: "30 days", basis: "client" }]);
    fetchMock.mockResolvedValue(chat(plan({ areas: [{ name: "Compound", cameras: [], uncovered: [], notes: [] }] })));
    await expect(draftDesignPlan(job)).rejects.toThrow(/did not place any cameras/);
  });
});

describe("step 2: the write-up around the plan", () => {
  it("sends the settled plan with the record and returns the rest in the app's field names", async () => {
    fetchMock.mockResolvedValue(chat(writeUp()));
    const out = await draftDesignWrite(job, plan());
    const { user, body } = sent();
    expect(user.task).toBe("draftDesignWrite");
    expect(JSON.stringify(user.plan)).toContain("Main gate, in view");
    expect(body.response_format?.json_schema?.name).toBe("design_write");
    expect(out.summary).toMatch(/head office/);
    expect(out.rest.options).toEqual([{ area: "Compound", gap: "Side gate", option: "1 LPR camera", extraCameras: 1 }]);
    expect(out.rest.openItems).toEqual([{ item: "Gate positions", status: "To be confirmed on site" }]);
    expect(out.rest.nextSteps).toEqual(["Confirm the open items"]);
    expect(out.assumptions).toEqual(["Recorder in the server room"]);
  });

  it("refuses a write-up with no summary", async () => {
    fetchMock.mockResolvedValue(chat(writeUp({ summary: "  " })));
    await expect(draftDesignWrite(job, plan())).rejects.toThrow(/did not produce a summary/);
  });

  it("flags a site figure in the site description that is not in the record", async () => {
    fetchMock.mockResolvedValue(chat(writeUp({ site_overview: "The compound is about 90 m long." })));
    expect((await draftDesignWrite(job, plan())).unverifiedFigures).toEqual(["90 m"]);
  });
});

describe("guard rails", () => {
  it("both steps keep facts from the record, no prices, standards or compliance, and treat photo notes as unverified", () => {
    for (const prompt of [DESIGN_PLAN_PROMPT, DESIGN_WRITE_PROMPT]) {
      for (const rule of [/ONLY from the record/, /never invent a room/, /no prices/, /no standards/i, /compliance/, /UNVERIFIED/, /not as verified facts/]) expect(prompt).toMatch(rule);
    }
  });

  it("the plan keeps privacy rooms uncovered and keeps to the number of cameras the client asked for", () => {
    expect(DESIGN_PLAN_PROMPT).toMatch(/toilets/);
    expect(DESIGN_PLAN_PROMPT).toMatch(/how many cameras the client wants, plan exactly that many/);
  });

  it("the write-up does not change the plan, leaves counts to the app and lists every assumption as open", () => {
    expect(DESIGN_WRITE_PROMPT).toMatch(/SETTLED/);
    expect(DESIGN_WRITE_PROMPT).toMatch(/Do not change, re-count or re-argue it/);
    expect(DESIGN_WRITE_PROMPT).toMatch(/Do NOT state camera totals/);
    expect(DESIGN_WRITE_PROMPT).toMatch(/every basis row marked assumption/);
  });
});

describe("system sizing inputs (D-037)", () => {
  const sv = (value: number, basis = "assumption") => ({ value, basis, note: "" });
  const sized = () => ({
    ...plan({ areas: [{ name: "Compound", cameras: [{ id: "X1", location: "Gate", type: "lpr", purpose: "Plates", detail: "identify", distance_m: 6, megapixels: 2, fov_deg: 30 }], uncovered: [], notes: [] }] }),
    system: { codec: "h265", recording: "motion", fps: sv(15), motion_share: sv(0.35), retention_days: sv(14, "client"), bitrate_per_mp: sv(0.6), drive_tb: sv(8), ups_minutes: sv(30) },
  });

  it("the plan returns each camera's detail, distance, resolution and angle, and the system settings, in the app's names", async () => {
    fetchMock.mockResolvedValue(chat(sized()));
    const { plan: p } = await draftDesignPlan(job);
    expect((p.areas[0] as { cameras: unknown[] }).cameras[0]).toMatchObject({ id: "X1", detail: "identify", distanceM: 6, megapixels: 2, fovDeg: 30 });
    expect(p.system).toMatchObject({ codec: "h265", recording: "motion", retentionDays: sv(14, "client"), upsMinutes: sv(30) });
  });

  it("the write-up is given the app's sizing and does not flag its figures", async () => {
    fetchMock.mockResolvedValue(chat(writeUp({ summary: "About 1.3 TB of storage on one drive, with a 200 VA UPS." })));
    const out = await draftDesignWrite(job, plan(), { storage: "1.3 TB for 14 days (1 x 8 TB drives)", ups: "200 VA for 30 minutes" });
    expect(sent().user.sizing).toMatchObject({ ups: "200 VA for 30 minutes" });
    expect(out.unverifiedFigures).toEqual([]);
  });

  it("the prompts leave all sizing arithmetic to the app and ask the write-up to name cameras that fall short", () => {
    expect(DESIGN_PLAN_PROMPT).toMatch(/Do NOT calculate storage, bandwidth, drives, PoE, recorder size or UPS/);
    expect(DESIGN_PLAN_PROMPT).toMatch(/identify for faces at entrances/);
    expect(DESIGN_WRITE_PROMPT).toMatch(/camerasShortOfDetail/);
    expect(DESIGN_WRITE_PROMPT).toMatch(/the recorder, the drives, the PoE switches and the UPS \(the app lists those from the sizing\)/);
  });
});
