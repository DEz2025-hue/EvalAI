import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { REPORT_PHOTO_LIMIT, selectReportPhotos, shrinkArgs, shrinkImage } from "../reportPhotos";

// A tiny PNG made in memory (no files needed).
function png(w: number, h: number): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([x % 255, y % 255, 120], y * (w * 3 + 1) + 1 + x * 3);
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

/** Width and height of a JPEG from its start-of-frame marker. */
function jpegSize(b: Uint8Array): { w: number; h: number } {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("not a jpeg marker");
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  throw new Error("no frame");
}

describe("choosing photos for a report", () => {
  const ev = (id: string, mimeType: string, uploadedAt: string) => ({ id, mimeType, uploadedAt });
  it("keeps images only, oldest first, and counts what did not fit", () => {
    const items = [ev("c", "image/jpeg", "2026-01-03"), ev("a", "image/png", "2026-01-01"), ev("v", "audio/mp4", "2026-01-02"), ev("b", "image/webp", "2026-01-02"), ev("pdf", "application/pdf", "2026-01-04")];
    expect(selectReportPhotos(items)).toEqual({ chosen: ["a", "b", "c"], skipped: 0 });
    expect(selectReportPhotos(items, 2)).toEqual({ chosen: ["a", "b"], skipped: 1 });
  });
  it("caps a report at the photo limit", () => {
    const many = Array.from({ length: REPORT_PHOTO_LIMIT + 5 }, (_, i) => ev("p" + i, "image/jpeg", `2026-01-${String(i + 1).padStart(2, "0")}`));
    const r = selectReportPhotos(many);
    expect(r.chosen).toHaveLength(REPORT_PHOTO_LIMIT);
    expect(r.skipped).toBe(5);
  });
});

describe("shrinking a photo", () => {
  it("builds arguments that fit inside the size without enlarging", () => {
    const args = shrinkArgs("in", "out.jpg", 640, 8).join(" ");
    expect(args).toContain("min(640,iw)");
    expect(args).toContain("force_original_aspect_ratio=decrease");
    expect(args).toContain("-frames:v 1");
  });

  it("turns a big picture into a smaller JPEG with the same shape", async () => {
    const out = await shrinkImage(png(1600, 800), 640, 8);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    const { w, h } = jpegSize(out);
    expect(w).toBe(640);
    expect(h).toBe(320);
  }, 30000);

  it("does not enlarge a small picture", async () => {
    const { w, h } = jpegSize(await shrinkImage(png(200, 100), 640, 8));
    expect(w).toBe(200);
    expect(h).toBe(100);
  }, 30000);

  it("refuses an empty or unreadable file", async () => {
    await expect(shrinkImage(new Uint8Array(10), 640, 8)).rejects.toThrow(/empty/);
    await expect(shrinkImage(new Uint8Array(500).fill(7), 640, 8)).rejects.toThrow(/could not be read/);
  }, 30000);
});
