import { describe, it, expect } from "vitest";
import { buildAdapterConfig, isAiConfigured } from "../config";

// One line (AI_PROVIDER) switches between Meta and OpenRouter; each keeps its own key. The older single key/address pair still works.
const both = { META_API_KEY: "meta-key", OPENROUTER_API_KEY: "or-key" };

describe("choosing the provider with AI_PROVIDER", () => {
  it("meta uses the Meta key and Meta's address", () => {
    expect(buildAdapterConfig({ ...both, AI_PROVIDER: "meta" })).toMatchObject({ provider: "meta", apiKey: "meta-key", baseUrl: "https://api.meta.ai" });
  });

  it("openrouter uses the OpenRouter key, the /api address and meta/ model ids", () => {
    const c = buildAdapterConfig({ ...both, AI_PROVIDER: "openrouter" });
    expect(c).toMatchObject({ provider: "openrouter", apiKey: "or-key", baseUrl: "https://openrouter.ai/api" });
    expect(c.ops.analyzeImage.model).toBe("meta/muse-spark-1.3");
  });

  it("switching is only the AI_PROVIDER line: the other key is never used", () => {
    expect(buildAdapterConfig({ ...both, AI_PROVIDER: "meta" }).apiKey).toBe("meta-key");
    expect(buildAdapterConfig({ ...both, AI_PROVIDER: "openrouter" }).apiKey).toBe("or-key");
  });

  it("each provider's address can be overridden", () => {
    expect(buildAdapterConfig({ META_API_KEY: "k", META_BASE_URL: "https://api.example.test/v1", AI_PROVIDER: "meta" }).baseUrl).toBe("https://api.example.test");
    expect(buildAdapterConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_BASE_URL: "https://openrouter.ai", AI_PROVIDER: "openrouter" }).baseUrl).toBe("https://openrouter.ai/api");
  });
});

describe("older single-key setups keep working", () => {
  it("AI_PROVIDER_API_KEY + AI_PROVIDER_BASE_URL behave as before", () => {
    expect(buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai" })).toMatchObject({ provider: "meta", apiKey: "k" });
    expect(buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER: "openrouter", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api" })).toMatchObject({ provider: "openrouter", apiKey: "k", baseUrl: "https://openrouter.ai/api" });
  });

  it("a per-provider key wins over the single one", () => {
    expect(buildAdapterConfig({ AI_PROVIDER: "openrouter", AI_PROVIDER_API_KEY: "old", OPENROUTER_API_KEY: "new" }).apiKey).toBe("new");
  });

  it("an unknown AI_PROVIDER value is ignored (the address decides, as before)", () => {
    expect(buildAdapterConfig({ AI_PROVIDER: "xxxx", AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai" }).provider).toBe("meta");
  });
});

describe("leftovers from the older setup can't override the switch", () => {
  it("an explicit AI_PROVIDER=meta wins over an old OpenRouter address, and that address is not used", () => {
    const c = buildAdapterConfig({ AI_PROVIDER: "meta", META_API_KEY: "m", AI_PROVIDER_API_KEY: "old-or-key", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api" });
    expect(c).toMatchObject({ provider: "meta", apiKey: "m", baseUrl: "https://api.meta.ai" });
  });

  it("an explicit AI_PROVIDER=openrouter ignores an old Meta address the same way", () => {
    const c = buildAdapterConfig({ AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "o", AI_PROVIDER_BASE_URL: "https://api.meta.ai" });
    expect(c).toMatchObject({ provider: "openrouter", apiKey: "o", baseUrl: "https://openrouter.ai/api" });
  });

  it("with no AI_PROVIDER at all, the old address still decides", () => {
    expect(buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://openrouter.ai/api" }).provider).toBe("openrouter");
  });
});

describe("a missing key says which one to set", () => {
  it("names the variable for the chosen provider, without any key text", () => {
    expect(() => buildAdapterConfig({ AI_PROVIDER: "openrouter", META_API_KEY: "meta-key" })).toThrow(/Missing AI_PROVIDER_API_KEY \(or OPENROUTER_API_KEY for AI_PROVIDER=openrouter\)/);
    expect(() => buildAdapterConfig({ AI_PROVIDER: "meta", OPENROUTER_API_KEY: "or-key" })).toThrow(/META_API_KEY/);
    let message = "";
    try {
      buildAdapterConfig({ AI_PROVIDER: "meta", OPENROUTER_API_KEY: "or-key-secret" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain("secret");
  });

  it("isAiConfigured is true only with a key for the chosen provider", () => {
    expect(isAiConfigured({ AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k" })).toBe(true);
    expect(isAiConfigured({ AI_PROVIDER: "openrouter", META_API_KEY: "k" })).toBe(false);
    expect(isAiConfigured({ AI_PROVIDER_API_KEY: "" })).toBe(false);
    expect(isAiConfigured({})).toBe(false);
    // a Contributor-mode model id is a configuration error too
    expect(isAiConfigured({ META_API_KEY: "k", META_SPARK_MODEL: "muse-spark-1.3-contributor" })).toBe(false);
  });
});
