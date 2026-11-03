import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiAdapterError } from "@eval-ai/ai-adapter";

const spend = vi.fn();
vi.mock("../aiUsage", async (orig) => {
  const real = await orig<typeof import("../aiUsage")>();
  return { ...real, spendTodayUsd: (...a: unknown[]) => spend(...a), recordAiRun: vi.fn() };
});

import { adapterErrorResponse, aiError, aiGuard } from "../aiRoute";

const authed = (ws = "11111111-1111-4111-8111-111111111111") => ({ mode: "authenticated", ctx: { workspaceId: ws, userId: "u", role: "member" } }) as never;

async function body(res: Response) {
  return (await res.json()) as { error: string; code?: string };
}

describe("provider failures become safe, actionable responses", () => {
  it("billing problem: a clear 503 that does not leak the provider's message or team id", async () => {
    const res = adapterErrorResponse(new AiAdapterError("AI provider billing is not set up for this account", "billing", 402, "billing_not_configured"));
    expect(res.status).toBe(503);
    const b = await body(res);
    expect(b.code).toBe("ai_billing");
    expect(b.error).toMatch(/billing/i);
    expect(b.error).toMatch(/continue manually/i);
    expect(JSON.stringify(b)).not.toMatch(/team_id|billing_not_configured|dev\.meta\.ai/);
  });

  it("a wrong model id is a server configuration problem, not a 404 for the user", async () => {
    const err = new AiAdapterError("AI model or endpoint not found — check the configured model id", "model_not_found", 404, "model_not_found");
    const viaAiError = aiError(err); // must not be caught by the generic /not found/ text match
    expect(viaAiError.status).toBe(503);
    expect((await body(viaAiError)).code).toBe("ai_config");
    expect(JSON.stringify(await body(aiError(err)))).not.toMatch(/model id|not found/i);
  });

  it("maps the other provider failures", async () => {
    expect(adapterErrorResponse(new AiAdapterError("x", "rate_limit", 429)).status).toBe(429);
    expect(adapterErrorResponse(new AiAdapterError("x", "timeout", 504)).status).toBe(504);
    expect(adapterErrorResponse(new AiAdapterError("x", "content_policy", 400)).status).toBe(422);
    expect(adapterErrorResponse(new AiAdapterError("x", "provider_error", 500)).status).toBe(502);
    expect(adapterErrorResponse(new AiAdapterError("x", "auth", 401)).status).toBe(503);
  });

  it("audio problems keep their helpful message; silence is reported plainly; malformed output is generic", async () => {
    const unsupported = adapterErrorResponse(new AiAdapterError("Audio must be a WAV file — convert other formats first", "unsupported_audio"));
    expect(unsupported.status).toBe(400);
    expect((await body(unsupported)).error).toMatch(/WAV/);

    const silent = adapterErrorResponse(new AiAdapterError("No speech was detected in the recording", "invalid_response"));
    expect(silent.status).toBe(422);
    expect((await body(silent)).error).toMatch(/No speech/);

    const bad = adapterErrorResponse(new AiAdapterError("The AI returned an answer that is not valid JSON", "invalid_response"));
    expect(bad.status).toBe(502);
    expect((await body(bad)).error).not.toMatch(/JSON/);
  });

  it("a key with almost no credit says so and what to do, instead of blaming the request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    const res = adapterErrorResponse(new AiAdapterError("The AI provider account has too little credit left for this request", "billing", 402, "402", 1039));
    expect(res.status).toBe(503);
    const out = await body(res);
    expect(out.error).toMatch(/OpenRouter account has almost no credit/);
    expect(out.error).toMatch(/Add credit at openrouter\.ai/);
    expect(out.error).toMatch(/key's spending limit/);
    expect(out.code).toBe("ai_billing");
    expect(JSON.stringify(out)).not.toMatch(/1039|workspaces|keys\/|sk-or/);
    vi.unstubAllEnvs();
  });

  it("billing and config errors name the provider that raised them, so a paid Meta plan isn't blamed for an empty OpenRouter account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const billing = () => new AiAdapterError("billing", "billing", 402, "billing_not_configured");
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    expect((await body(adapterErrorResponse(billing()))).error).toMatch(/OpenRouter account has no credit.*openrouter\.ai/);
    expect((await body(adapterErrorResponse(new AiAdapterError("x", "auth", 401)))).error).toMatch(/Provider in use: OpenRouter/);

    vi.stubEnv("AI_PROVIDER", "meta");
    vi.stubEnv("META_API_KEY", "LLM|test");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("AI_PROVIDER_BASE_URL", "");
    const meta = (await body(adapterErrorResponse(billing()))).error;
    expect(meta).toMatch(/Meta billing is not set up/);
    expect(meta).not.toMatch(/OpenRouter/);
    expect((await body(adapterErrorResponse(new AiAdapterError("x", "auth", 401)))).error).toMatch(/Provider in use: Meta/);
    vi.unstubAllEnvs();
  });

  it("a cut-off answer says the AI ran out of room and suggests fewer photos, without provider internals; the log says why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cut = adapterErrorResponse(new AiAdapterError("The AI answer was cut off (token limit reached) — raise the limit or lower the reasoning effort", "invalid_response"));
    expect(cut.status).toBe(502);
    const text = (await body(cut)).error;
    expect(text).toMatch(/ran out of room/);
    expect(text).toMatch(/fewer photos/);
    expect(text).not.toMatch(/token|reasoning|limit/i);
    // The server log names the case, so a bug report doesn't have to guess between cut off, empty and broken JSON.
    expect(log.mock.calls.some((c) => c.join(" ").includes("cut off"))).toBe(true);
    // The generic message is unchanged for other unusable answers.
    expect((await body(adapterErrorResponse(new AiAdapterError("The AI returned an empty answer", "invalid_response")))).error).toMatch(/unusable answer/);
    log.mockRestore();
  });
});

describe("aiGuard: rate limit and daily spend cap", () => {
  beforeEach(() => {
    spend.mockReset();
    spend.mockResolvedValue(0);
    delete process.env.AI_DAILY_COST_CAP_USD;
  });
  afterEach(() => {
    delete process.env.AI_DAILY_COST_CAP_USD;
  });

  it("limits calls per workspace and operation", async () => {
    const auth = authed("22222222-2222-4222-8222-222222222222");
    expect(await aiGuard(auth, "limit-test", 2)).toBeNull();
    expect(await aiGuard(auth, "limit-test", 2)).toBeNull();
    const third = await aiGuard(auth, "limit-test", 2);
    expect(third?.status).toBe(429);
    // another workspace is unaffected
    expect(await aiGuard(authed("33333333-3333-4333-8333-333333333333"), "limit-test", 2)).toBeNull();
  });

  it("is off when no cap is configured", async () => {
    spend.mockResolvedValue(9999);
    expect(await aiGuard(authed("44444444-4444-4444-8444-444444444444"), "cap-off", 100)).toBeNull();
    expect(spend).not.toHaveBeenCalled();
  });

  it("blocks once the workspace has reached its daily estimated spend", async () => {
    process.env.AI_DAILY_COST_CAP_USD = "5";
    spend.mockResolvedValue(5.01);
    const res = await aiGuard(authed("55555555-5555-4555-8555-555555555555"), "cap-on", 100);
    expect(res?.status).toBe(429);
    expect((await body(res as Response)).error).toMatch(/daily AI limit/);
  });

  it("allows work below the cap", async () => {
    process.env.AI_DAILY_COST_CAP_USD = "5";
    spend.mockResolvedValue(1.2);
    expect(await aiGuard(authed("66666666-6666-4666-8666-666666666666"), "cap-under", 100)).toBeNull();
  });
});
