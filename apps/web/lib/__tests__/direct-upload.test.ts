import { describe, it, expect } from "vitest";
import { hasValidMagic, isOwnKey, kindForMime, newStorageKey, safeFileName, UPLOAD_RULES } from "../directUpload";

const A = "55555555-5555-4555-8555-555555555555";
const B = "66666666-6666-4666-8666-666666666666";

describe("storage keys", () => {
  it("are generated under the job and recognised as that job's own", () => {
    const key = newStorageKey("photo", A, "Roof photo (1).JPG");
    expect(key.startsWith("evidence/" + A + "/")).toBe(true);
    expect(isOwnKey(key, A)).toBe(true);
  });

  it("voice recordings live under voice/", () => {
    expect(newStorageKey("audio", A, "note.webm").startsWith("voice/" + A + "/")).toBe(true);
  });

  it("another job's key, path tricks and made-up keys are rejected", () => {
    const key = newStorageKey("photo", A, "a.jpg");
    expect(isOwnKey(key, B)).toBe(false);
    expect(isOwnKey("evidence/" + A + "/../" + B + "/x.jpg", A)).toBe(false);
    expect(isOwnKey("evidence/" + A + "/not-a-uuid-x.jpg", A)).toBe(false);
    expect(isOwnKey("reports/" + A + "/00000000-0000-4000-8000-000000000000-x.pdf", A)).toBe(false);
    expect(isOwnKey("evidence/" + A + "/00000000-0000-4000-8000-000000000000-" + "x".repeat(200), A)).toBe(false);
  });

  it("file names are sanitised", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("..hidden")).not.toMatch(/^\./);
    expect(safeFileName("a b$c.jpg")).toBe("a_b_c.jpg");
    expect(safeFileName("")).toBe("file");
  });

  it("every generated key differs even for the same file", () => {
    expect(newStorageKey("photo", A, "a.jpg")).not.toBe(newStorageKey("photo", A, "a.jpg"));
  });
});

describe("what was actually stored is checked, not what the client claimed", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
  const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0, 0, 0, 0]);

  it("accepts matching magic bytes", () => {
    expect(hasValidMagic(jpeg, "image/jpeg")).toBe(true);
    expect(hasValidMagic(png, "image/png")).toBe(true);
    expect(hasValidMagic(pdf, "application/pdf")).toBe(true);
    expect(hasValidMagic(webp, "image/webp")).toBe(true);
  });

  it("rejects a mismatch (e.g. an executable renamed .jpg, or a PNG declared as JPEG)", () => {
    expect(hasValidMagic(new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "image/jpeg")).toBe(false);
    expect(hasValidMagic(png, "image/jpeg")).toBe(false);
    expect(hasValidMagic(jpeg, "application/pdf")).toBe(false);
  });

  it("a RIFF/WAVE file cannot pass as WebP", () => {
    expect(hasValidMagic(wav, "image/webp")).toBe(false);
  });

  it("audio containers are not magic-checked but are type- and size-limited", () => {
    expect(hasValidMagic(new Uint8Array(16), "audio/webm")).toBe(true);
    expect(UPLOAD_RULES.audio.maxBytes).toBe(25 * 1024 * 1024);
  });
});

describe("allowed types", () => {
  it("maps mime types to upload kinds and refuses everything else", () => {
    expect(kindForMime("image/jpeg")).toBe("photo");
    expect(kindForMime("application/pdf")).toBe("document");
    expect(kindForMime("audio/mp4")).toBe("audio");
    expect(kindForMime("text/html")).toBeNull();
    expect(kindForMime("application/x-msdownload")).toBeNull();
    expect(kindForMime("image/svg+xml")).toBeNull(); // SVG can carry script
  });
});
