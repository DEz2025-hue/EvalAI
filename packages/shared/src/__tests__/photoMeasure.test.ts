import { describe, it, expect } from "vitest";
import { boxFromCorners, checkPhotoCapture, PHOTO_REFERENCES, referenceScale, type PhotoCapture } from "../photoMeasure";
import { calculateMeasurement, hasPhotoInput, verifyPhotoReading } from "../measurements";

// A4 portrait filling 420 x 594 px of a 2000 x 1500 photo = exactly 2 px per mm (0.5 mm per px).
const a4Box = { x1: 100, y1: 100, x2: 519, y2: 693 };
const base: PhotoCapture = { reference: "a4", method: "manual", imageW: 2000, imageH: 1500, refBox: a4Box, from: { x: 600, y: 900 }, to: { x: 1600, y: 900 } };

describe("referenceScale", () => {
  it("gives 0.5 mm per pixel for A4 at 2 px per mm, in either orientation", () => {
    const portrait = referenceScale(PHOTO_REFERENCES.a4, a4Box);
    expect(portrait.mmPerPx).toBeCloseTo(0.5, 6);
    expect(portrait.ratioError).toBeCloseTo(0, 6);
    const landscape = referenceScale(PHOTO_REFERENCES.a4, { x1: 0, y1: 0, x2: 593, y2: 419 });
    expect(landscape.mmPerPx).toBeCloseTo(0.5, 6);
    expect(landscape.ratioError).toBeCloseTo(0, 6);
  });
  it("shows a large error for a sheet rotated 45 degrees (its box becomes nearly square)", () => {
    expect(referenceScale(PHOTO_REFERENCES.a4, { x1: 0, y1: 0, x2: 358, y2: 358 }).ratioError).toBeGreaterThan(0.2);
  });
  it("normalises corners tapped in any order", () => {
    expect(boxFromCorners({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x1: 10, y1: 20, x2: 50, y2: 80 });
  });
});

describe("checkPhotoCapture", () => {
  it("measures 1000 px as 500 mm", () => {
    const r = checkPhotoCapture(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lengthMm).toBeCloseTo(500, 3);
  });
  it("rejects a tilted or rotated reference", () => {
    const r = checkPhotoCapture({ ...base, refBox: { x1: 100, y1: 100, x2: 458, y2: 458 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/tilted or rotated/);
  });
  it("rejects a reference that is too small in the photo", () => {
    const r = checkPhotoCapture({ ...base, refBox: { x1: 100, y1: 100, x2: 159, y2: 183 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too small/);
  });
  it("requires enough AI confidence when the AI found the reference, but not for a hand-marked one", () => {
    expect(checkPhotoCapture({ ...base, method: "sam" }).ok).toBe(false);
    expect(checkPhotoCapture({ ...base, method: "sam", confidence: 0.3 }).ok).toBe(false);
    expect(checkPhotoCapture({ ...base, method: "sam", confidence: 0.9 }).ok).toBe(true);
    expect(checkPhotoCapture({ ...base, method: "manual" }).ok).toBe(true);
  });
  it("rejects points outside the photo, identical points and non-finite numbers", () => {
    expect(checkPhotoCapture({ ...base, to: { x: 2500, y: 900 } }).ok).toBe(false);
    expect(checkPhotoCapture({ ...base, to: base.from }).ok).toBe(false);
    expect(checkPhotoCapture({ ...base, from: { x: NaN, y: 1 } }).ok).toBe(false);
    expect(checkPhotoCapture(undefined).ok).toBe(false);
    expect(checkPhotoCapture({ ...base, reference: "nope" as never }).ok).toBe(false);
  });
  it("refuses lengths far beyond the reference's size", () => {
    // A card (85.6 mm) at 340 px wide: 3900 px is about 982 mm, more than 10 x 85.6 mm.
    const card: PhotoCapture = { reference: "card", method: "manual", imageW: 4000, imageH: 3000, refBox: { x1: 100, y1: 100, x2: 439, y2: 313 }, from: { x: 50, y: 2000 }, to: { x: 3950, y: 2000 } };
    const r = checkPhotoCapture(card);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/much longer/);
  });
});

describe("photo readings in measurements", () => {
  it("accepts a value that matches the recorded points and rejects one that does not", () => {
    expect(verifyPhotoReading(0.5, "m", base)).toBeNull();
    expect(verifyPhotoReading(50, "cm", base)).toBeNull();
    expect(verifyPhotoReading(0.62, "m", base)).toMatch(/doesn't match/);
    expect(verifyPhotoReading(0.5, "m", { ...base, method: "sam" })).toMatch(/confident/);
  });
  it("does not change the calculation, keeps the capture, and flags the record", () => {
    const typed = calculateMeasurement("area", { length: { value: 0.5, unit: "m" }, width: { value: 2, unit: "m" } });
    const photo = calculateMeasurement("area", { length: { value: 0.5, unit: "m", source: "photo", photo: base }, width: { value: 2, unit: "m" } });
    expect(photo.value).toBe(typed.value);
    expect(hasPhotoInput(photo.inputs)).toBe(true);
    expect(hasPhotoInput(typed.inputs)).toBe(false);
  });
  it("rejects a photo input that fails the checks, or is claimed on a ratio field", () => {
    expect(() => calculateMeasurement("area", { length: { value: 0.5, unit: "m", source: "photo" }, width: { value: 2, unit: "m" } })).toThrow(/missing/);
    expect(() => calculateMeasurement("area", { length: { value: 9, unit: "m", source: "photo", photo: base }, width: { value: 2, unit: "m" } })).toThrow(/doesn't match/);
    expect(() => calculateMeasurement("cable_with_sag", { straight: { value: 3, unit: "m" }, factor: { value: 1.05, unit: "ratio", source: "photo", photo: base } })).toThrow(/camera/);
  });
});
