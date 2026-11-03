import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAdapterConfig } from "../config";
import { PLAN_REVIEW_PROMPT, cleanHolds, planReviewSchema, reviewAndPlan } from "../planReview";

describe("the plan review model", () => {
  it("uses Muse Wonder by default and can be overridden", () => {
    expect(buildAdapterConfig({ META_API_KEY: "k" }).ops.reviewPlan.model).toBe("muse-wonder-1.0");
    expect(buildAdapterConfig({ META_API_KEY: "k", AI_MODEL_PLAN: "muse-spark-1.3" }).ops.reviewPlan.model).toBe("muse-spark-1.3");
  });

  it("refuses a Contributor-mode model", () => {
    expect(() => buildAdapterConfig({ META_API_KEY: "k", AI_MODEL_PLAN: "muse-spark-1.3-contributor" })).toThrow(/Contributor/);
  });
});

describe("when Muse Wonder is overloaded", () => {
  const answer = { holds: [], phases: [{ name: "Survey", goal: "g", tasks: ["t"], owner: "o", done_when: "d", hold_point: true }] };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const record = { workspaceId: "w", assessmentId: "a", siteName: "S", mode: "assessment" as const, pack: "solar" as const, checklist: [], findings: [], measurements: [], materials: [], limitations: [], photos: [], glance: { total: 0, checked: 0, pass: 0, issue: 0, needsAttention: 0, notApplicable: 0, notChecked: 0, requiredNotChecked: 0 }, findingsAwaitingReview: 0 };
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to Muse Spark and says which model answered", async () => {
    vi.stubEnv("META_API_KEY", "k");
    const models: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const model = JSON.parse(init.body as string).model as string;
      models.push(model);
      return model === "muse-wonder-1.0" ? reply(400, { error: { message: "overloaded" } }) : reply(200, { choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }], usage: {} });
    }));
    await expect(reviewAndPlan(record, {})).rejects.toThrow();
    expect(models).toEqual(["muse-wonder-1.0"]); // not an overload: no second try

    models.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const model = JSON.parse(init.body as string).model as string;
      models.push(model);
      return model === "muse-wonder-1.0" ? reply(429, { error: { message: "overloaded" } }) : reply(200, { choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }], usage: {} });
    }));
    const out = await reviewAndPlan(record, {}, { request: { maxRetries: 0 } });
    expect(models).toEqual(["muse-wonder-1.0", "muse-spark-1.3"]);
    expect(out.model).toBe("muse-spark-1.3");
  });
});

describe("cleanHolds", () => {
  const known = { items: ["Electrical supply", "Orientation, tilt, shading survey"], photoIds: ["ev1", "ev2"] };

  it("turns titles and photo numbers into real sources, ignoring case", () => {
    const { holds, dropped } = cleanHolds([{ title: "No earthing", priority: "high", why: "Marked Pass but the note says none.", action: "Have an electrician install it.", item_titles: ["electrical  SUPPLY"], photo_numbers: [2] }], known);
    expect(dropped).toEqual([]);
    expect(holds[0].basis).toEqual([{ kind: "item", ref: "Electrical supply" }, { kind: "photo", ref: "ev2" }]);
  });

  it("drops a hold with no real source, or with text missing, and names it", () => {
    const { holds, dropped } = cleanHolds(
      [
        { title: "Invented", priority: "high", why: "w", action: "a", item_titles: ["Not in the report"], photo_numbers: [9] },
        { title: "Empty", priority: "high", why: "", action: "a", item_titles: ["Electrical supply"], photo_numbers: [] },
      ],
      known,
    );
    expect(holds).toEqual([]);
    expect(dropped).toEqual(["Invented", "Empty"]);
  });

  it("treats anything but high as medium", () => {
    expect(cleanHolds([{ title: "T", priority: "urgent", why: "w", action: "a", item_titles: ["Electrical supply"] }], known).holds[0].priority).toBe("medium");
  });
});

describe("the prompt and schema", () => {
  it("looks behind checklist results but cannot rewrite them or invent a timeline", () => {
    expect(PLAN_REVIEW_PROMPT).toContain("a Pass only means the item was looked at");
    expect(PLAN_REVIEW_PROMPT).toContain("Never restate a checklist result");
    expect(PLAN_REVIEW_PROMPT).toContain("give no timeline");
  });

  it("only lets the model cite the job's real checklist titles", () => {
    const s = planReviewSchema(["Roof", "Earthing"]) as { properties: { holds: { items: { properties: { item_titles: { items: { enum?: string[] } } } } } } };
    expect(s.properties.holds.items.properties.item_titles.items.enum).toEqual(["Roof", "Earthing"]);
  });

  it("requires every field, as strict output needs", () => {
    const s = planReviewSchema() as { required: string[]; properties: Record<string, { items: { required: string[]; properties: object } }> };
    expect(s.required).toEqual(["holds", "phases"]);
    for (const key of s.required) expect(s.properties[key].items.required).toEqual(Object.keys(s.properties[key].items.properties));
  });
});
