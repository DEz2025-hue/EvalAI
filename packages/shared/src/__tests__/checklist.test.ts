import { describe, it, expect } from "vitest";
import { isPass, isChecked, ChecklistStatus } from "../checklist";

describe("checklist status semantics", () => {
  it("isPass only true for pass", () => {
    expect(isPass("pass")).toBe(true);
    expect(isPass("fail")).toBe(false);
    expect(isPass("not_checked")).toBe(false);
  });
  it("isChecked distinguishes not_checked from pass", () => {
    expect(isChecked("not_checked")).toBe(false);
    expect(isChecked("pass")).toBe(true);
    expect(isChecked("fail")).toBe(true);
    expect(isChecked("needs_attention")).toBe(true);
  });
  it("unknown status is rejected by zod", () => {
    expect(() => ChecklistStatus.parse("unknown")).toThrow();
  });
  it("not_checked must not be treated as pass — exit gate invariant", () => {
    const status = "not_checked" as const;
    expect(isPass(status)).toBe(false);
    expect(isChecked(status)).toBe(false);
  });
});
