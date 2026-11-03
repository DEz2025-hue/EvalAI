import { describe, it, expect } from "vitest";
import { buildAdapterConfig, isAiConfigured } from "../config";

// Meta's own Model API is the only provider: one key, one optional address. The older key/address pair still works.

describe("the Meta key and address", () => {
  it("uses META_API_KEY and Meta's address by default", () => {
    expect(buildAdapterConfig({ META_API_KEY: "meta-key" })).toMatchObject({ provider: "meta", apiKey: "meta-key", baseUrl: "https://api.meta.ai" });
  });

  it("META_BASE_URL overrides the address, and a trailing /v1 is dropped", () => {
    expect(buildAdapterConfig({ META_API_KEY: "k", META_BASE_URL: "https://api.example.test/v1" }).baseUrl).toBe("https://api.example.test");
  });

  it("the older AI_PROVIDER_API_KEY / AI_PROVIDER_BASE_URL pair still works", () => {
    expect(buildAdapterConfig({ AI_PROVIDER_API_KEY: "k", AI_PROVIDER_BASE_URL: "https://api.meta.ai" })).toMatchObject({ provider: "meta", apiKey: "k", baseUrl: "https://api.meta.ai" });
    expect(buildAdapterConfig({ AI_PROVIDER_API_KEY: "k" })).toMatchObject({ apiKey: "k", baseUrl: "https://api.meta.ai" });
  });

  it("META_API_KEY wins over the older key", () => {
    expect(buildAdapterConfig({ META_API_KEY: "new", AI_PROVIDER_API_KEY: "old" }).apiKey).toBe("new");
  });

  it("model ids are used as given, with no prefix", () => {
    const c = buildAdapterConfig({ META_API_KEY: "k", META_SPARK_MODEL: "muse-spark-1.3", AI_MODEL_ANALYZE: "muse-wonder-1.0" });
    expect(c.ops.liveFrame.model).toBe("muse-spark-1.3");
    expect(c.ops.analyzeAssessment.model).toBe("muse-wonder-1.0");
  });
});

describe("a missing or misplaced key", () => {
  it("names the variable to set, without any key text", () => {
    expect(() => buildAdapterConfig({})).toThrow(/Missing META_API_KEY/);
    let message = "";
    try {
      buildAdapterConfig({ META_BASE_URL: "key-secret-value" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Missing META_API_KEY/);
    expect(message).not.toContain("secret");
  });

  it("an API key pasted into the address line is refused without echoing it", () => {
    let message = "";
    try {
      buildAdapterConfig({ META_API_KEY: "k", META_BASE_URL: "LLM|secretvalue" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/web address/);
    expect(message).not.toContain("secretvalue");
  });

  it("isAiConfigured is true only with a key and a valid configuration", () => {
    expect(isAiConfigured({ META_API_KEY: "k" })).toBe(true);
    expect(isAiConfigured({ AI_PROVIDER_API_KEY: "" })).toBe(false);
    expect(isAiConfigured({})).toBe(false);
    // a Contributor-mode model id is a configuration error too
    expect(isAiConfigured({ META_API_KEY: "k", META_SPARK_MODEL: "muse-spark-1.3-contributor" })).toBe(false);
  });
});
