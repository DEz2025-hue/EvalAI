import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chatJson } from "../chat";
import { buildAdapterConfig } from "../config";
import { AiAdapterError } from "../client";

const fetchMock = vi.fn();
const answer = (content: unknown, finish = "stop") =>
  new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }], usage: { prompt_tokens: 500, completion_tokens: 900, total_tokens: 1400, completion_tokens_details: { reasoning_tokens: 800 } } }), { status: 200 });
const cutOff = () => answer('{"a":', "length");

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

const cfg = () => buildAdapterConfig(process.env as Record<string, string>);
const args = { system: "s", user: "u", schemaName: "x", schema: {} };
const sentBody = (n: number) => JSON.parse(String((fetchMock.mock.calls[n][1] as RequestInit).body)) as { reasoning_effort?: string; max_completion_tokens?: number };

describe("an answer cut off by the token limit", () => {
  it("is tried once more with less reasoning and more room, and the person never sees the failure", async () => {
    fetchMock.mockResolvedValueOnce(cutOff()).mockResolvedValueOnce(answer({ ok: true }));
    const runs: Array<{ status: string; errorCode?: string; effort?: string }> = [];
    const out = await chatJson(cfg(), "analyzeAssessment", args, { onRun: (r) => void runs.push(r) });
    expect(out.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(0)).toMatchObject({ reasoning_effort: "high", max_completion_tokens: 16000 });
    expect(sentBody(1)).toMatchObject({ reasoning_effort: "low", max_completion_tokens: 24000 });
    // The cut-off call is recorded too (it was billed), so spend caps stay honest.
    expect(runs.map((r) => [r.status, r.errorCode ?? null, r.effort])).toEqual([["error", "truncated", "high"], ["ok", null, "low"]]);
  });

  it("keeps 'low' as it is and only adds room", async () => {
    fetchMock.mockResolvedValueOnce(cutOff()).mockResolvedValueOnce(answer({ ok: true }));
    await chatJson(cfg(), "siteIntake", args);
    expect(sentBody(0)).toMatchObject({ reasoning_effort: "low", max_completion_tokens: 8000 });
    expect(sentBody(1)).toMatchObject({ reasoning_effort: "low", max_completion_tokens: 12000 });
  });

  it("gives up after one retry, with the same error as before", async () => {
    fetchMock.mockImplementation(async () => cutOff()); // a fresh response each time: a body can only be read once
    const err = await chatJson(cfg(), "siteIntake", args).catch((e) => e as AiAdapterError);
    expect(err).toBeInstanceOf(AiAdapterError);
    expect((err as AiAdapterError).code).toBe("invalid_response");
    expect((err as AiAdapterError).message).toMatch(/^The AI answer was cut off/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is the only case that is retried: an empty answer or broken JSON fails straight away", async () => {
    fetchMock.mockResolvedValueOnce(answer("   "));
    await expect(chatJson(cfg(), "siteIntake", args)).rejects.toThrow(/empty answer/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(answer("not json at all"));
    await expect(chatJson(cfg(), "siteIntake", args)).rejects.toThrow(/not valid JSON/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });


});

describe("site intake defaults", () => {
  it("use low reasoning and room for a full answer, so up to 20 photos don't use the whole budget thinking", () => {
    expect(cfg().ops.siteIntake).toMatchObject({ reasoningEffort: "low", maxCompletionTokens: 8000 });
  });

  it("can still be overridden from the environment", () => {
    process.env.AI_EFFORT_INTAKE = "high";
    process.env.AI_MAX_TOKENS_INTAKE = "3000";
    expect(cfg().ops.siteIntake).toMatchObject({ reasoningEffort: "high", maxCompletionTokens: 3000 });
  });
});
