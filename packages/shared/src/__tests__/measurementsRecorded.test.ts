import { describe, it, expect } from "vitest";
import { calculateMeasurement, toMetres } from "../measurements";

describe("unit conversion", () => {
  it("converts to metres", () => {
    expect(toMetres(100, "cm")).toBe(1);
    expect(toMetres(2500, "mm")).toBe(2.5);
    expect(toMetres(10, "ft")).toBeCloseTo(3.048, 6);
    expect(toMetres(12, "in")).toBeCloseTo(0.3048, 6);
  });
  it("rejects non-finite numbers", () => {
    expect(() => toMetres(NaN, "m")).toThrow();
  });
});

describe("recorded calculations", () => {
  it("area records the method and the inputs as entered", () => {
    const r = calculateMeasurement("area", { length: { value: 10, unit: "m" }, width: { value: 600, unit: "cm" } });
    expect(r.value).toBe(60);
    expect(r.unit).toBe("m²");
    expect(r.method).toMatch(/length × width/);
    expect(r.inputs.width).toEqual({ value: 600, unit: "cm" }); // original unit kept for the audit trail
  });

  it("mixed units give the same answer as metres", () => {
    const a = calculateMeasurement("area", { length: { value: 10, unit: "ft" }, width: { value: 5, unit: "ft" } });
    expect(a.value).toBeCloseTo(4.645152, 5);
  });

  it("volume multiplies three dimensions", () => {
    expect(calculateMeasurement("volume", { length: { value: 2, unit: "m" }, width: { value: 3, unit: "m" }, height: { value: 4, unit: "m" } }).value).toBe(24);
  });

  it("cable length applies the slack factor", () => {
    expect(calculateMeasurement("cable_with_sag", { straight: { value: 100, unit: "m" }, factor: { value: 1.1, unit: "ratio" } }).value).toBe(110);
  });

  it("is deterministic and free of float noise", () => {
    const run = () => calculateMeasurement("area", { length: { value: 0.1, unit: "m" }, width: { value: 0.2, unit: "m" } }).value;
    expect(run()).toBe(run());
    expect(run()).toBe(0.02);
  });

  it("rejects missing, zero, negative and non-numeric inputs with a clear message", () => {
    expect(() => calculateMeasurement("area", { length: { value: 10, unit: "m" } })).toThrow(/Width is required/);
    expect(() => calculateMeasurement("area", { length: { value: 0, unit: "m" }, width: { value: 5, unit: "m" } })).toThrow(/greater than zero/);
    expect(() => calculateMeasurement("area", { length: { value: -1, unit: "m" }, width: { value: 5, unit: "m" } })).toThrow(/greater than zero/);
    expect(() => calculateMeasurement("area", { length: { value: NaN, unit: "m" }, width: { value: 5, unit: "m" } })).toThrow(/number/);
  });

  it("rejects an out-of-range slack factor", () => {
    expect(() => calculateMeasurement("cable_with_sag", { straight: { value: 10, unit: "m" }, factor: { value: 0.5, unit: "ratio" } })).toThrow(/between 1.00 and 2.00/);
    expect(() => calculateMeasurement("cable_with_sag", { straight: { value: 10, unit: "m" }, factor: { value: 3, unit: "ratio" } })).toThrow();
  });
});
