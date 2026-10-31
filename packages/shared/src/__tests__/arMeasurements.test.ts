import { describe, it, expect } from "vitest";
import { calculateMeasurement, hasArInput, isAcceptableArCapture } from "../measurements";

const good = { tracking: "tracking", hit: "plane", depth: false };

describe("AR-assisted inputs", () => {
  it("accepts only steady tracking with a plane or depth hit", () => {
    expect(isAcceptableArCapture(good)).toBe(true);
    expect(isAcceptableArCapture({ ...good, hit: "depth", depth: true })).toBe(true);
    expect(isAcceptableArCapture({ ...good, tracking: "limited" })).toBe(false);
    expect(isAcceptableArCapture({ ...good, hit: "estimate" })).toBe(false);
    expect(isAcceptableArCapture(undefined)).toBe(false);
  });

  it("does not change the calculation and passes provenance through for the record", () => {
    const typed = calculateMeasurement("area", { length: { value: 4, unit: "m" }, width: { value: 3, unit: "m" } });
    const ar = calculateMeasurement("area", { length: { value: 4, unit: "m", source: "ar", ar: good }, width: { value: 3, unit: "m", source: "typed" } });
    expect(ar.value).toBe(typed.value);
    expect(ar.inputs.length.source).toBe("ar");
    expect(hasArInput(ar.inputs)).toBe(true);
    expect(hasArInput(typed.inputs)).toBe(false);
    expect(hasArInput(null)).toBe(false);
  });

  it("refuses an AR input that fails the quality check", () => {
    expect(() => calculateMeasurement("area", { length: { value: 4, unit: "m", source: "ar", ar: { ...good, tracking: "limited" } }, width: { value: 3, unit: "m" } })).toThrow(/not steady enough/);
  });
});
