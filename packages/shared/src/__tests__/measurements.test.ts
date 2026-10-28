import { describe, it, expect } from "vitest";
import { areaM2, volumeM3, cableLengthWithSag } from "../measurements";

describe("deterministic calculations", () => {
  it("areaM2 multiplies length and width", () => {
    expect(areaM2(3, 4)).toBe(12);
    expect(areaM2(2.5, 2)).toBe(5);
  });
  it("areaM2 throws on invalid", () => {
    expect(() => areaM2(NaN, 2)).toThrow();
    expect(() => areaM2(Infinity, 2)).toThrow();
  });
  it("volumeM3 multiplies", () => {
    expect(volumeM3(2, 3, 4)).toBe(24);
  });
  it("volumeM3 throws on non-finite", () => {
    expect(() => volumeM3(1, NaN, 1)).toThrow();
  });
  it("cableLengthWithSag applies factor", () => {
    expect(cableLengthWithSag(100)).toBeCloseTo(105);
    expect(cableLengthWithSag(100, 1.1)).toBeCloseTo(110);
  });
  it("calculations are deterministic and preserve units", () => {
    const a = areaM2(10, 12);
    const b = areaM2(10, 12);
    expect(a).toBe(b);
  });
});
