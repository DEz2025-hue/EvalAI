import { describe, it, expect } from "vitest";
import { isPass, isChecked, ChecklistStatus, parseMeasurement, responseProblem } from "../checklist";

describe("answer rules", () => {
  const required = { title: "Roof", required: true };
  it("a measured value needs a unit", () => {
    expect(responseProblem({ status: "pass", measuredValue: 2.5 }, required)).toMatch(/unit/);
    expect(responseProblem({ status: "pass", measuredValue: 2.5, measuredUnit: " " }, required)).toMatch(/unit/);
    expect(responseProblem({ status: "pass", measuredValue: 2.5, measuredUnit: "m" }, required)).toBeNull();
    expect(responseProblem({ status: "pass", measuredValue: null }, required)).toBeNull();
  });
  it("Not Applicable on a required item needs a reason; on an optional item it doesn't", () => {
    expect(responseProblem({ status: "not_applicable" }, required)).toMatch(/reason/);
    expect(responseProblem({ status: "not_applicable", notes: "No roof — ground mount" }, required)).toBeNull();
    expect(responseProblem({ status: "not_applicable" }, { title: "Extra", required: false })).toBeNull();
  });
});

describe("parseMeasurement", () => {
  it("reads decimals with a point or a comma, and leaves unfinished input empty", () => {
    expect(parseMeasurement("2.5")).toBe(2.5);
    expect(parseMeasurement("2,5")).toBe(2.5);
    expect(parseMeasurement("2.")).toBe(2);
    expect(parseMeasurement("-0.4")).toBe(-0.4);
    for (const t of ["", " ", "-", ".", "abc"]) expect(parseMeasurement(t)).toBeUndefined();
  });
});

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
