import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { photoReview } from "../photoReview";
import { buildAdapterConfig } from "../config";

const fetchMock = vi.fn();
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } }), { status: 200 });

const I1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const base = {
  mode: "assessment" as const,
  pack: "solar" as const,
  scenario: "existing" as const,
  goal: "Check the roof array",
  checklist: [{ id: I1, title: "Inverter / charge controller — make, model, status", status: "fail", notes: "Shows an error" }],
  photos: [
    { evidenceId: E1, itemId: I1, imageBase64: "QUJD", mimeType: "image/jpeg" },
    { evidenceId: E2, imageBase64: "QUJD", mimeType: "image/jpeg" },
  ],
};

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

const reply = (photos: unknown[]) => chat({ photos });
const one = (evidence_id: string, extra: Record<string, unknown> = {}) => ({
  evidence_id,
  caption: "A wall-mounted inverter with a red light.",
  observations: ["Inverter mounted on a wall", "A red indicator is lit"],
  possible_issues: [{ text: "The red light may be a fault indicator.", confidence: "medium" }],
  cannot_tell: ["The error code on the display is not readable"],
  ...extra,
});

describe("photoReview", () => {
  it("uses Muse Spark with low effort, overridable per operation, and refuses Contributor models", () => {
    const c = buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai" });
    expect(c.ops.photoReview).toMatchObject({ model: "muse-spark-1.3", reasoningEffort: "low" });
    expect(buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai", AI_MAX_TOKENS_PHOTOS: "777" }).ops.photoReview.maxCompletionTokens).toBe(777);
    expect(() => buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai", AI_MODEL_PHOTOS: "muse-spark-1.3-contributor" })).toThrow(/Contributor/);
  });

  it("sends every photo inline, in order, with its linked checklist item and the answers as context", async () => {
    fetchMock.mockResolvedValue(reply([one(E1), one(E2)]));
    await photoReview(base);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }> };
    const parts = body.messages.find((m) => m.role === "user")!.content;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    const text = parts[0].text!;
    expect(text).toContain("EXISTING SYSTEM");
    expect(text).toContain("Shows an error");
    expect(text).toContain(E1);
    expect(text).toContain("Inverter / charge controller");
  });

  it("asks for specific, qualitative descriptions (apparent condition, readable labels) and still bans measurements and verdicts", async () => {
    fetchMock.mockResolvedValue(reply([one(E1), one(E2)]));
    await photoReview(base);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string | unknown[] }> };
    const system = String(body.messages.find((m) => m.role === "system")!.content);
    expect(system).toMatch(/its apparent condition in plain words/);
    expect(system).toMatch(/label or text you can actually read, quoted exactly/);
    expect(system).toMatch(/Describe what you can see, not what you assume/);
    expect(system).toMatch(/Never give dimensions, counts, ratings, ages or capacities as facts/);
    expect(system).toMatch(/never say anything passes, fails or is compliant/);
    expect(system).toMatch(/never invent details that are not visible/);
  });

  it("returns cleaned per-photo results, always for human review", async () => {
    fetchMock.mockResolvedValue(reply([one(E1), one(E2, { caption: "A roof with panels." })]));
    const out = await photoReview(base);
    expect(out.requiresHumanReview).toBe(true);
    expect(out.notAnalyzed).toEqual([]);
    expect(out.photos.map((p) => p.evidenceId)).toEqual([E1, E2]);
    expect(out.photos[0].possibleIssues).toEqual([{ text: "The red light may be a fault indicator.", confidence: "medium" }]);
    expect(out.photos[1].caption).toBe("A roof with panels.");
  });

  it("drops invented evidence ids and duplicates, and reports photos that got no answer", async () => {
    fetchMock.mockResolvedValue(reply([one("made-up"), one(E1), one(E1, { caption: "second copy" })]));
    const out = await photoReview(base);
    expect(out.photos.map((p) => p.evidenceId)).toEqual([E1]);
    expect(out.photos[0].caption).toBe("A wall-mounted inverter with a red light.");
    expect(out.notAnalyzed).toEqual([E2]);
  });

  it("ignores an empty answer for a photo, caps lengths and counts, and defaults unknown confidence to low", async () => {
    fetchMock.mockResolvedValue(
      reply([
        one(E1, { observations: Array.from({ length: 12 }, (_, i) => `Observation ${i}`), possible_issues: [{ text: "x".repeat(600), confidence: "certain" }, { text: "  ", confidence: "high" }] }),
        one(E2, { caption: "", observations: [], possible_issues: [], cannot_tell: [] }),
      ]),
    );
    const out = await photoReview(base);
    expect(out.photos).toHaveLength(1);
    expect(out.photos[0].observations).toHaveLength(10);
    expect(out.photos[0].possibleIssues).toHaveLength(1);
    expect(out.photos[0].possibleIssues[0].text).toHaveLength(360);
    expect(out.photos[0].possibleIssues[0].confidence).toBe("low");
    expect(out.notAnalyzed).toEqual([E2]);
  });

  it("allows at most four photos per call and only image types", async () => {
    const photo = { evidenceId: E1, imageBase64: "QUJD", mimeType: "image/jpeg" };
    await expect(photoReview({ ...base, photos: [photo, photo, photo, photo, photo] })).rejects.toThrow();
    await expect(photoReview({ ...base, photos: [] })).rejects.toThrow();
    await expect(photoReview({ ...base, photos: [{ ...photo, mimeType: "image/gif" }] })).rejects.toThrow(/Unsupported image type/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the report summary sees the photo notes as unverified", () => {
  it("sends them as photoNotes with a rule not to treat them as findings, and works without photos", async () => {
    const { draftReportNarrative } = await import("../reportDraft");
    fetchMock.mockImplementation(async () => chat({ summary: "A short summary of the visit.", site_overview: "", key_findings: [], open_items: "", missing_information: [], assumptions: [] }));
    const job = { workspaceId: "w", assessmentId: "a1", siteName: "S", mode: "assessment" as const, pack: "solar" as const, checklist: [], findings: [], measurements: [], limitations: [] };
    await draftReportNarrative({ ...job, photos: [{ itemTitle: "Inverter", caption: "A wall-mounted inverter.", observations: ["Red light lit"], possibleIssues: ["The red light may be a fault"] }] });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }> };
    const system = body.messages.find((m) => m.role === "system")!.content;
    const user = body.messages.find((m) => m.role === "user")!.content;
    expect(system).toMatch(/UNVERIFIED/);
    expect(system).toMatch(/Never present a photo note as a confirmed finding/);
    expect(user).toContain("photoNotes");
    expect(user).toContain("The red light may be a fault");
    fetchMock.mockClear();
    await draftReportNarrative(job);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).messages.find((m: { role: string }) => m.role === "user").content).toContain('"photoNotes":[]');
  });
});
