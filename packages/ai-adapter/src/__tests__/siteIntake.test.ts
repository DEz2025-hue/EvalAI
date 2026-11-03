import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { siteIntake } from "../siteIntake";
import { buildAdapterConfig } from "../config";

const fetchMock = vi.fn();
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } }), { status: 200 });

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const checklist = [
  { id: A, title: "Inverter / charge controller — make, model, status", lookFor: "Photograph the label." },
  { id: B, title: "Orientation, tilt, shading survey" },
];
const base = { mode: "assessment" as const, pack: "solar" as const, scenario: "new_install" as const, description: "Tin roof, big tree to the north-west", images: [{ imageBase64: "QUJD", mimeType: "image/jpeg" }], checklist };

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

const reply = (extra: Record<string, unknown> = {}) =>
  chat({
    start_here: { item_id: B, title: "", reason: "A tree may shade the roof." },
    new_items: [{ title: "Tree trimming and roof access", look_for: "Note the tree's distance and height.", why: "A large tree is in the description.", category: "Site" }],
    guidance_updates: [{ item_id: B, look_for: "Photograph the tree line from the roof edge." }],
    visible: ["A corrugated metal roof"],
    limitations: ["Roof strength cannot be judged from a photo"],
    uncertainty: "medium",
    ...extra,
  });

describe("siteIntake configuration", () => {
  it("uses Muse Spark with low effort (up to 20 photos must not use the whole budget thinking) and a longer deadline, overridable per operation", () => {
    const c = buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai" });
    expect(c.ops.siteIntake).toMatchObject({ model: "muse-spark-1.3", reasoningEffort: "low", maxCompletionTokens: 8000, timeoutMs: 60_000 });
    const o = buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai", AI_MODEL_INTAKE: "muse-wonder-1.0", AI_MAX_TOKENS_INTAKE: "999" });
    expect(o.ops.siteIntake).toMatchObject({ model: "muse-wonder-1.0", maxCompletionTokens: 999 });
    expect(() => buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai", AI_MODEL_INTAKE: "muse-spark-1.3-contributor" })).toThrow(/Contributor/);
  });
});

describe("siteIntake", () => {
  it("sends the description, the situation, the checklist with guidance, and every photo inline", async () => {
    fetchMock.mockResolvedValue(reply());
    await siteIntake(base);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> }> };
    const parts = body.messages.find((m) => m.role === "user")!.content;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(1);
    expect(parts[1].image_url!.url).toBe("data:image/jpeg;base64,QUJD");
    const text = parts[0].text!;
    expect(text).toContain("NEW INSTALLATION");
    expect(text).toContain("big tree");
    expect(text).toContain("Photograph the label.");
  });

  it("returns start-here, new items and sharper guidance, always marked for human review", async () => {
    fetchMock.mockResolvedValue(reply());
    const out = await siteIntake(base);
    expect(out.startHere).toEqual({ itemId: B, title: "Orientation, tilt, shading survey", reason: "A tree may shade the roof." });
    expect(out.newItems).toEqual([{ title: "Tree trimming and roof access", lookFor: "Note the tree's distance and height.", why: "A large tree is in the description.", category: "Site" }]);
    expect(out.guidanceUpdates).toEqual([{ itemId: B, lookFor: "Photograph the tree line from the roof edge." }]);
    expect(out.requiresHumanReview).toBe(true);
    expect(out.limitations.join(" ")).toMatch(/not findings or measurements/);
  });

  it("drops invented ids, repeats of existing titles, duplicates and empty text", async () => {
    fetchMock.mockResolvedValue(
      reply({
        start_here: { item_id: "made-up-id", title: "", reason: "x" },
        new_items: [
          { title: "orientation,  tilt, shading survey", look_for: "dup of an existing item", why: "", category: "" },
          { title: "ok", look_for: "too short a title", why: "", category: "" },
          { title: "Gate and access width", look_for: "Measure nothing; note how a ladder would reach.", why: "", category: "" },
          { title: "Gate and access width", look_for: "second copy", why: "", category: "" },
        ],
        guidance_updates: [
          { item_id: "not-on-the-list", look_for: "invented" },
          { item_id: A, look_for: "   " },
          { item_id: A, look_for: "Read the display, then the label." },
          { item_id: A, look_for: "second update for the same item" },
        ],
      }),
    );
    const out = await siteIntake(base);
    expect(out.startHere).toBeNull();
    expect(out.newItems.map((i) => i.title)).toEqual(["Gate and access width"]);
    expect(out.guidanceUpdates).toEqual([{ itemId: A, lookFor: "Read the display, then the label." }]);
  });

  it("accepts a title-only start when the model names no existing item", async () => {
    fetchMock.mockResolvedValue(reply({ start_here: { item_id: "", title: "Walk the roof edge safely", reason: "Check access first" } }));
    const out = await siteIntake(base);
    expect(out.startHere).toEqual({ itemId: null, title: "Walk the roof edge safely", reason: "Check access first" });
  });

  it("caps long text and the number of items, and defaults unknown uncertainty to high", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Extra item number ${i}`, look_for: "x".repeat(900), why: "y", category: "" }));
    fetchMock.mockResolvedValue(reply({ new_items: many, uncertainty: "certain" }));
    const out = await siteIntake(base);
    expect(out.newItems).toHaveLength(8);
    expect(out.newItems[0].lookFor.length).toBe(400);
    expect(out.uncertainty).toBe("high");
  });

  it("needs a description or a photo, allows at most twenty photos, and refuses other image types", async () => {
    await expect(siteIntake({ ...base, description: "  ", images: [] })).rejects.toThrow();
    await expect(siteIntake({ ...base, images: Array.from({ length: 21 },() => ({ imageBase64: "QUJD", mimeType: "image/jpeg" })) })).rejects.toThrow();
    await expect(siteIntake({ ...base, images: [{ imageBase64: "QUJD", mimeType: "image/gif" }] })).rejects.toThrow(/Unsupported image type/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("works from a description alone", async () => {
    fetchMock.mockResolvedValue(reply());
    await siteIntake({ ...base, images: [] });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: unknown[] }> };
    expect(body.messages.find((m) => m.role === "user")!.content).toHaveLength(1);
  });
});
