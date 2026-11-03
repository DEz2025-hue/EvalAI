import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { analyzeImage, IMAGE_ANALYST_PROMPT } from "../image";
import { lensesFor } from "../photoLens";
import { getAdapterConfig } from "../config";

// One photo, studied for its job and checklist item (D-035).

const fetchMock = vi.fn();
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } }), { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.AI_PROVIDER_API_KEY = "test-key-1234567890";
  process.env.AI_PROVIDER_BASE_URL = "https://api.meta.ai";
  for (const k of Object.keys(process.env)) if (/^(META_|AI_MODEL_|AI_EFFORT_|AI_MAX_TOKENS_)/.test(k)) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const roofJob = {
  pack: "solar" as const,
  mode: "assessment" as const,
  scenario: "new_install" as const,
  siteName: "Palm Road house",
  goal: "Rooftop solar for the house",
  siteBrief: { address: "12 Palm Road" },
  item: { title: "Roof condition and orientation", category: "Site", lookFor: "Roof material, condition, shading and the best area for panels.", status: "not_checked" },
  otherItems: ["Load details — appliances and ratings", "Main board"],
};

const answer = (over: Record<string, unknown> = {}) => ({
  summary: "A corrugated metal roof on a single-storey house.",
  fit: "yes",
  relevance: "Shows the roof surface and the tree to one side.",
  better_items: [],
  observations: ["Corrugated sheet roof, two slopes"],
  readings: [],
  suggestions: ["The larger right-hand slope looks clearest for panels."],
  possible_issues: ["Rust staining along the lower edge"],
  suggested_note: "Corrugated roof, right slope clear; tree on the left shades part of the left slope.",
  limitations: ["Orientation cannot be told from the photo"],
  uncertainty: "medium",
  ...over,
});

const sent = () => {
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }> };
  return { system: String(body.messages.find((m) => m.role === "system")!.content), user: JSON.parse((body.messages.find((m) => m.role === "user")!.content as Array<{ text?: string }>)[0].text!) };
};

describe("lenses", () => {
  it("picks the lens from the item, within the job's pack", () => {
    expect(lensesFor("solar", { title: "Roof condition and orientation" })).toEqual(["solarRoof", "solarGeneral"]);
    expect(lensesFor("solar", { title: "Load details", lookFor: "List the appliances" })).toEqual(["loads", "solarGeneral"]);
    expect(lensesFor("solar", { title: "Main distribution board" })).toEqual(["electrical", "solarGeneral"]);
    expect(lensesFor("solar", { title: "Existing inverter and batteries" })).toEqual(["powerEquipment", "solarGeneral"]);
    expect(lensesFor("cctv", { title: "Main gate and perimeter" })).toEqual(["cctvSite", "cctvGeneral"]);
    expect(lensesFor("cctv", { title: "Roof access" })).toEqual(["cctvGeneral"]);
    expect(lensesFor("solar", null)).toEqual(["solarGeneral"]);
  });

  it("an AC unit under a loads item is read as a load, not as a roof", () => {
    expect(lensesFor("solar", { title: "Customer loads", lookFor: "Air conditioners, fridges and pumps with their ratings" })[0]).toBe("loads");
  });
});

describe("analyzeImage", () => {
  it("runs with medium reasoning and room for a full answer", () => {
    const op = getAdapterConfig().ops.analyzeImage;
    expect(op.reasoningEffort).toBe("medium");
    expect(op.maxCompletionTokens).toBeGreaterThanOrEqual(8000);
    expect(op.timeoutMs).toBeLessThan(60_000);
  });

  it("sends the job, the item with what it asks for, and the roof lens", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    await analyzeImage({ imageBase64: "QUJD", mimeType: "image/jpeg", context: roofJob });
    const { system, user } = sent();
    expect(user.job).toMatchObject({ pack: "solar", goal: "Rooftop solar for the house" });
    expect(user.job.situation).toMatch(/NEW INSTALLATION/);
    expect(user.item).toMatchObject({ title: "Roof condition and orientation", lookFor: "Roof material, condition, shading and the best area for panels." });
    expect(user.otherItems).toEqual(["Load details — appliances and ratings", "Main board"]);
    expect(system).toMatch(/SOLAR ROOF OR MOUNTING AREA/);
    expect(system).toMatch(/most suitable for panels/);
    expect(system).not.toMatch(/LOADS AND APPLIANCES/);
  });

  it("returns fit, relevance, suggestions and a draft note", async () => {
    fetchMock.mockResolvedValue(chat(answer()));
    const out = await analyzeImage({ imageBase64: "QUJD", mimeType: "image/jpeg", context: roofJob });
    expect(out).toMatchObject({ fit: "yes", relevance: "Shows the roof surface and the tree to one side.", suggestions: ["The larger right-hand slope looks clearest for panels."], requiresHumanReview: true });
    expect(out.suggestedNote).toMatch(/right slope clear/);
    expect(out.limitations.at(-1)).toMatch(/suggestion, not a verified measurement/);
  });

  it("keeps label readings, drops empty ones, and only names other items that exist on the job", async () => {
    fetchMock.mockResolvedValue(chat(answer({ fit: "no", better_items: ["load details — appliances and ratings", "Invented item"], readings: [{ label: "Cooling capacity", value: "18,000 BTU/h" }, { label: "Model", value: "" }] })));
    const out = await analyzeImage({ imageBase64: "QUJD", mimeType: "image/jpeg", context: roofJob });
    expect(out.fit).toBe("no");
    expect(out.betterItems).toEqual(["Load details — appliances and ratings"]);
    expect(out.readings).toEqual([{ label: "Cooling capacity", value: "18,000 BTU/h" }]);
  });

  it("without a job it still works, with no item fit", async () => {
    fetchMock.mockResolvedValue(chat(answer({ fit: "yes" })));
    const out = await analyzeImage({ imageBase64: "QUJD", mimeType: "image/jpeg" });
    expect(out.fit).toBe("no_item");
    expect(sent().user.item).toMatch(/not linked/);
  });

  it("keeps the guard rails: purpose first, label values as readings only, no estimates, no verdicts, untrusted text", () => {
    for (const rule of [/Study the photo FOR THAT PURPOSE/, /only when they affect the work/, /readings of printed text, not verified measurements/, /Never guess a digit/, /from your own estimate/, /Never say anything passes, fails, is safe or complies/, /untrusted text/]) {
      expect(IMAGE_ANALYST_PROMPT).toMatch(rule);
    }
  });
});
