import { describe, it, expect, beforeAll, vi } from "vitest";
import zlib from "zlib";
import { PDFDocument, PDFPage } from "pdf-lib";
import type { ReportInput, ReportPhoto, ReportSnapshot } from "@eval-ai/shared";
import { buildReportPdf } from "../pdf";
import { shrinkImage } from "../reportPhotos";

// Photos in the PDF (D-022): real JPEG copies, paginated, always labelled as not verified.
const snap: ReportSnapshot = { id: "snap_pdf", assessmentId: "a1", assessmentVersion: 1, checklistVersion: "v1", createdAt: "2026-11-01T00:00:00.000Z", createdBy: "u", finalized: false, immutable: true };

function png(w: number, h: number): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([(x * 3) % 255, (y * 5) % 255, 120], y * (w * 3 + 1) + 1 + x * 3);
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

let THUMB = "";
beforeAll(async () => {
  THUMB = "data:image/jpeg;base64," + Buffer.from(await shrinkImage(png(900, 600), 640, 8)).toString("base64");
}, 30000);

const photo = (i: number, over: Partial<ReportPhoto> = {}): ReportPhoto => ({
  evidenceId: "e" + i,
  caption: `Photo ${i} shows a wall-mounted inverter.`,
  itemTitle: "Inverter",
  observations: ["Mounted on a wall", "A red light is lit"],
  possibleIssues: [{ text: "The red light may be a fault indicator.", confidence: "medium" }],
  cannotTell: ["The display is not readable"],
  thumbnail: THUMB,
  ...over,
});
const input = (photos?: ReportPhoto[]): ReportInput => ({ siteName: "Site", mode: "assessment", pack: "solar", context: { goal: "g" }, checklist: [{ title: "Roof", status: "pass" }], findings: [], measurements: [], limitations: [], photos });

describe("PDF with photos", () => {
  it("embeds the pictures and stays readable with one photo", async () => {
    const without = await buildReportPdf(snap, input());
    const withOne = await buildReportPdf(snap, input([photo(1)]));
    expect(withOne.length).toBeGreaterThan(without.length + 1000); // the picture is really inside
    expect((await PDFDocument.load(withOne)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("draws the outlines over a marked photo, with a legend that says they are not verified", async () => {
    const texts: string[] = [];
    const rectangles: Array<{ x: number; y: number; width: number; height: number; color?: unknown }> = [];
    const text = PDFPage.prototype.drawText;
    const rect = PDFPage.prototype.drawRectangle;
    const a = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, t: string, o?: never) {
      texts.push(t);
      return text.call(this, t, o);
    });
    const b = vi.spyOn(PDFPage.prototype, "drawRectangle").mockImplementation(function (this: PDFPage, o?: never) {
      rectangles.push(o as never);
      return rect.call(this, o);
    });
    await buildReportPdf(snap, input([photo(1, { highlights: [{ label: "Palms may shade the roof", x: 0.5, y: 0.25, w: 0.25, h: 0.5 }] })]));
    a.mockRestore();
    b.mockRestore();
    expect(texts).toContain("A: Palms may shade the roof");
    expect(texts.join(" ")).toContain("Not verified, not a finding");
    // A 900 x 600 picture printed 340 wide: the outline is a share of what was drawn, not of the page.
    const outline = rectangles.find((r) => r.color === undefined && Math.abs(r.width - 85) < 0.5);
    expect(outline).toBeTruthy();
    expect(outline!.height).toBeCloseTo(113.33, 0);
  });

  it("paginates a full set of 12 photos without crashing or dropping any", async () => {
    const twelve = await buildReportPdf(snap, input(Array.from({ length: 12 }, (_, i) => photo(i + 1))));
    const six = await buildReportPdf(snap, input(Array.from({ length: 6 }, (_, i) => photo(i + 1))));
    const pages12 = (await PDFDocument.load(twelve)).getPageCount();
    const pages6 = (await PDFDocument.load(six)).getPageCount();
    expect(pages12).toBeGreaterThan(pages6);
    expect(pages12).toBeGreaterThan(2);
  }, 30000);

  it("a photo with a missing or corrupt picture keeps its text and does not break the report", async () => {
    const bytes = await buildReportPdf(snap, input([photo(1, { thumbnail: undefined }), photo(2, { thumbnail: "data:image/jpeg;base64,AAAA" }), photo(3, { thumbnail: "javascript:alert(1)" })]));
    expect(bytes.length).toBeGreaterThan(1000);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
