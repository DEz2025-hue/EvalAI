import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { liveFrame } from "../live";
import { clarifyContext, proposeChecklist } from "../text";
import { situationHint } from "../situation";

// Site situation (D-019): the model is told whether the job is a new installation or an existing system.
const fetchMock = vi.fn();
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }), { status: 200 });

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

/** The user message text that was sent to the model for the first call. */
function sentUser(): string {
  const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: unknown }> };
  const user = body.messages.find((m) => m.role === "user")!.content;
  return typeof user === "string" ? user : JSON.stringify(user);
}

describe("situation hint", () => {
  it("says nothing when the situation is not set or is not a known value", () => {
    expect(situationHint(undefined)).toBe("");
    expect(situationHint("upgrade")).toBe("");
    expect(situationHint("new_install")).toMatch(/NEW INSTALLATION/);
    expect(situationHint("existing")).toMatch(/EXISTING SYSTEM/);
  });
});

describe("the situation reaches the model", () => {
  it("in live frames", async () => {
    fetchMock.mockResolvedValue(chat({ notes: [], better_shot_tip: "", limitations: [], uncertainty: "high" }));
    await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", scenario: "new_install", checklist: [] });
    expect(sentUser()).toContain("NEW INSTALLATION");
  });
  it("in clarification, from the explicit field or from the stored context", async () => {
    fetchMock.mockResolvedValue(chat({ questions: [], missing_information: [], assumptions: [] }));
    await clarifyContext({ workspaceId: "w", mode: "assessment", pack: "solar", context: { scenario: "existing" } } as never).catch(() => undefined);
    expect(sentUser()).toContain("EXISTING SYSTEM");
  });
  it("in checklist proposals", async () => {
    fetchMock.mockResolvedValue(chat({ items: [], missing_information: [], assumptions: [] }));
    await proposeChecklist({ workspaceId: "w", mode: "assessment", pack: "cctv", scenario: "new_install", context: {} } as never).catch(() => undefined);
    expect(sentUser()).toContain("NEW INSTALLATION");
  });
  it("and an unset situation adds no claim", async () => {
    fetchMock.mockResolvedValue(chat({ notes: [], better_shot_tip: "", limitations: [], uncertainty: "high" }));
    await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", checklist: [] });
    expect(sentUser()).not.toMatch(/NEW INSTALLATION|EXISTING SYSTEM/);
  });
});

describe("what to look for reaches the live notes", () => {
  it("is sent for the current item and left empty otherwise", async () => {
    fetchMock.mockImplementation(async () => chat({ notes: [], better_shot_tip: "", limitations: [], uncertainty: "high" }));
    await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", checklist: [], currentLookFor: "Photograph the inverter label." });
    expect(sentUser()).toContain("Photograph the inverter label.");
    fetchMock.mockClear();
    await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", checklist: [] });
    expect(sentUser()).not.toContain("Photograph the inverter label.");
  });
});

describe("coverage hint for the item being looked at (D-023)", () => {
  const reply = () => chat({ notes: [], better_shot_tip: "", seen: ["Inverter label"], still_to_show: ["Display", "Mounting", "  "], limitations: [], uncertainty: "medium" });
  it("returns what the picture showed and what is still to show, cleaned, when the item has look-for text", async () => {
    fetchMock.mockImplementation(async () => reply());
    const out = await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", checklist: [], currentLookFor: "Photograph the label, the display and the mounting." });
    expect(out.seen).toEqual(["Inverter label"]);
    expect(out.stillToShow).toEqual(["Display", "Mounting"]);
  });
  it("drops the hint when there is no look-for text, even if the model returned one", async () => {
    fetchMock.mockImplementation(async () => reply());
    const out = await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", checklist: [] });
    expect(out.seen).toEqual([]);
    expect(out.stillToShow).toEqual([]);
  });
  it("tells the model to leave the lists empty without a look-for text and never to decide anything", async () => {
    fetchMock.mockImplementation(async () => reply());
    await liveFrame({ imageBase64: "QUJD", mimeType: "image/jpeg", mode: "assessment", pack: "solar", checklist: [], currentLookFor: "x".repeat(50) });
    const system = (JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { messages: Array<{ role: string; content: string }> }).messages.find((m) => m.role === "system")!.content;
    expect(system).toContain("under still_to_show");
    expect(system).toMatch(/never say an item passes, fails or is compliant/);
  });
});
