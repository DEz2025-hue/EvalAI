import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAdapterConfig } from "../config";
import { chatJson } from "../chat";
import { estimateTokenCostUsd } from "../pricing";

// OpenRouter is a testing route to the same Meta Muse models (D-018). Same safety checks, different addresses and ids.
const key = { AI_PROVIDER_API_KEY: "k" };

describe("OpenRouter configuration", () => {
  it("is chosen by AI_PROVIDER or by the web address, and puts the API under /api", () => {
    expect(buildAdapterConfig({ ...key, AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai" })).toMatchObject({ provider: "openrouter", baseUrl: "https://openrouter.ai/api" });
    expect(buildAdapterConfig({ ...key, AI_PROVIDER_BASE_URL: "https://openrouter.ai/api/v1" })).toMatchObject({ provider: "openrouter", baseUrl: "https://openrouter.ai/api" });
    expect(buildAdapterConfig({ ...key, AI_PROVIDER: "meta", AI_PROVIDER_BASE_URL: "https://api.meta.ai" })).toMatchObject({ provider: "meta", baseUrl: "https://api.meta.ai" });
  });

  it("uses Meta's model ids with the meta/ prefix, including for per-operation overrides", () => {
    const c = buildAdapterConfig({ ...key, AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api", META_SPARK_MODEL: "muse-spark-1.3", AI_MODEL_ANALYZE: "muse-wonder-1.0" });
    expect(c.ops.liveFrame.model).toBe("meta/muse-spark-1.3");
    expect(c.ops.analyzeImage.model).toBe("meta/muse-spark-1.3");
    expect(c.ops.analyzeAssessment.model).toBe("meta/muse-wonder-1.0");
    expect(buildAdapterConfig({ ...key, AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api", META_SPARK_MODEL: "meta/muse-spark-1.3" }).ops.liveFrame.model).toBe("meta/muse-spark-1.3");
  });

  it("still refuses Contributor models, with or without the prefix", () => {
    const base = { ...key, AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api" };
    expect(() => buildAdapterConfig({ ...base, META_SPARK_MODEL: "meta/muse-spark-1.3-contributor" })).toThrow(/Contributor/);
    expect(() => buildAdapterConfig({ ...base, AI_MODEL_LIVE: "muse-spark-1.2-contributor" })).toThrow(/Contributor/);
  });

  it("rejects a base address that is not a web address, without repeating it", () => {
    let message = "";
    try {
      buildAdapterConfig({ ...key, AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "sk-or-v1-secretvalue" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/must be a web address/);
    expect(message).not.toContain("secretvalue");
  });

  it("estimates cost for meta/ ids like Meta's own ids", () => {
    const usage = { promptTokens: 1000, completionTokens: 1000, reasoningTokens: 0, totalTokens: 2000 };
    expect(estimateTokenCostUsd("meta/muse-spark-1.3", usage)).toBe(estimateTokenCostUsd("muse-spark-1.3", usage));
    expect(estimateTokenCostUsd("meta/muse-spark-1.3", usage)).toBeCloseTo(0.0055, 6);
  });
});

describe("OpenRouter requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /api/v1/chat/completions with the meta/ model and a bearer key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const cfg = buildAdapterConfig({ ...key, AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api" });
    const out = await chatJson(cfg, "liveFrame", { system: "s", user: "u", schemaName: "x", schema: { type: "object" } });
    expect(out.data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect((init.headers as Record<string, string>)["X-Title"]).toBe("EvalAI");
    expect(JSON.parse(String(init.body)).model).toBe("meta/muse-spark-1.3");
  });
});

describe("voice and segmentation stay on Meta's own API", () => {
  it("say so plainly instead of calling OpenRouter", async () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_PROVIDER_BASE_URL", "https://openrouter.ai/api");
    vi.stubEnv("AI_PROVIDER_API_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeWav } = await import("../voice");
    const { samSegment } = await import("../sam");
    await expect(transcribeWav(new Uint8Array(10))).rejects.toMatchObject({ code: "not_configured" });
    await expect(samSegment({ imageBase64: "AA==", mimeType: "image/jpeg", prompt: "solar panel" } as never)).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

describe("OpenRouter with a nearly empty balance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const cfg = () => buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api" });
  const tooBig = (afford: number) => new Response(JSON.stringify({ error: { code: 402, message: `This request requires more credits, or fewer max_tokens. You requested up to 16000 tokens, but can only afford ${afford}.` } }), { status: 402 });
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });

  it("retries once with a smaller answer and less reasoning when the balance can only cover part of the request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tooBig(7823)).mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    const out = await chatJson(cfg(), "analyzeAssessment", { system: "s", user: "u", schemaName: "x", schema: { type: "object" } });
    expect(out.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.max_completion_tokens).toBe(16000);
    expect(first.reasoning_effort).toBe("high");
    expect(second.max_completion_tokens).toBe(7040);
    expect(second.reasoning_effort).toBe("medium");
  });

  it("says plainly that credit is low when even a small answer cannot be paid for", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => tooBig(300));
    vi.stubGlobal("fetch", fetchMock);
    await expect(chatJson(cfg(), "analyzeAssessment", { system: "s", user: "u", schemaName: "x", schema: { type: "object" } })).rejects.toMatchObject({ code: "billing", status: 402, message: expect.stringMatching(/too little credit/) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries on Meta's own API, where the answer size is not reserved up front", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => tooBig(7823));
    vi.stubGlobal("fetch", fetchMock);
    const meta = buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai" });
    await expect(chatJson(meta, "analyzeAssessment", { system: "s", user: "u", schemaName: "x", schema: { type: "object" } })).rejects.toMatchObject({ code: "billing" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
