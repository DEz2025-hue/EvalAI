import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEM_FIELDS_PROMPT, cleanFieldSuggestions, fieldSuggestionSchema, suggestItemFields } from "../itemFields";
import { imageSchema } from "../jsonSchemas";

const fields = [
  { key: "material", label: "Roof material", options: ["Tile", "Concrete"] },
  { key: "condition", label: "Roof condition", options: ["Good", "Poor"] },
];

describe("cleanFieldSuggestions", () => {
  it("keeps an offered choice on its own field, once, with its label", () => {
    expect(cleanFieldSuggestions([{ key: "material", value: "Tile" }, { key: "material", value: "Concrete" }], fields)).toEqual([{ key: "material", label: "Roof material", value: "Tile" }]);
  });

  it("drops an unknown field, a choice that belongs to another field, and rubbish", () => {
    expect(cleanFieldSuggestions([{ key: "structure", value: "Verified" }, { key: "material", value: "Good" }, { key: "condition", value: 7 }, null], fields)).toEqual([]);
    expect(cleanFieldSuggestions("nonsense", fields)).toEqual([]);
  });

  it("from notes, keeps a suggestion only when its quote really is in them", () => {
    const notes = "The roof is badly RUSTED, tiles everywhere.";
    expect(cleanFieldSuggestions([{ key: "condition", value: "Poor", quote: "badly rusted" }], fields, notes)).toEqual([{ key: "condition", label: "Roof condition", value: "Poor", quote: "badly rusted" }]);
    expect(cleanFieldSuggestions([{ key: "condition", value: "Poor", quote: "the structure is failing" }, { key: "material", value: "Tile" }], fields, notes)).toEqual([]);
  });
});

describe("the schemas", () => {
  it("limit the model to the offered keys and options", () => {
    const s = fieldSuggestionSchema(fields, true) as { items: { properties: { key: { enum: string[] }; value: { enum: string[] } }; required: string[] } };
    expect(s.items.properties.key.enum).toEqual(["material", "condition"]);
    expect(s.items.properties.value.enum).toEqual(["Tile", "Concrete", "Good", "Poor"]);
    expect(s.items.required).toContain("quote");
  });

  it("leave the photo schema unchanged for an item with no fields", () => {
    expect(JSON.stringify(imageSchema())).not.toContain("field_suggestions");
    expect((imageSchema(fields) as { required: string[] }).required).toContain("field_suggestions");
  });

  it("tell the model not to assume", () => {
    expect(ITEM_FIELDS_PROMPT).toContain("never assume");
    expect(ITEM_FIELDS_PROMPT).toContain("copied exactly");
  });
});

describe("suggestItemFields", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the notes as data on Muse Spark, and returns only what checks out", async () => {
    vi.stubEnv("META_API_KEY", "k");
    const content = JSON.stringify({ suggestions: [{ key: "material", value: "Tile", quote: "tile roof" }, { key: "condition", value: "Good", quote: "not in the notes at all" }] });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: {} }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await suggestItemFields({ title: "Roof", fields, notes: "A tile roof over the kitchen." });
    expect(out.suggestions).toEqual([{ key: "material", label: "Roof material", value: "Tile", quote: "tile roof" }]);
    expect(out.requiresHumanReview).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.messages[1].content).toContain("A tile roof over the kitchen.");
  });
});
