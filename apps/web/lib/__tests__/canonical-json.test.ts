import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { canonicalJson } from "../canonicalJson";

describe("canonicalJson", () => {
  it("gives the same text for the same content in a different key order, at every depth", () => {
    const a = { title: "Roof", status: "pass", rows: [{ notes: "n", category: "Site", required: true }], brief: { goal: "g", answers: [] } };
    const b = { brief: { answers: [], goal: "g" }, rows: [{ required: true, category: "Site", notes: "n" }], status: "pass", title: "Roof" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("still tells different content apart, and keeps the order of arrays", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson({ rows: [1, 2] })).not.toBe(canonicalJson({ rows: [2, 1] }));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });

  it("treats a missing value and an undefined one alike, as the database does", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });
});

describe("sign-off compares stored facts without depending on key order", () => {
  it("the facts check uses canonicalJson, not plain JSON.stringify (the live database reorders keys)", () => {
    const store = fs.readFileSync(path.join(__dirname, "../store.ts"), "utf8");
    expect(store).toMatch(/return canonicalJson\(facts\)/);
    expect(store).not.toMatch(/return JSON\.stringify\(facts\)/);
  });
});
