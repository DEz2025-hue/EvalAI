import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { REPORT_DISCLAIMER, type ReportInput, type ReportSnapshot } from "@eval-ai/shared";

// Deterministic PDF from a versioned snapshot — no AI regeneration at export.
// Uses saved facts + snapshot versions only; later edits create new snapshots.

const PAGE: [number, number] = [595, 842]; // A4
const MARGIN = 40;
const BOTTOM = 60; // keep clear of the footer
const MUTED: [number, number, number] = [0.39, 0.45, 0.55];

/** Characters the standard PDF fonts cannot encode are mapped to readable ASCII instead of crashing the export. */
const REPLACEMENTS: Record<string, string> = {
  "≠": "!=", "≤": "<=", "≥": ">=", "→": "->", "←": "<-", "²": "2", "³": "3", "–": "-", "—": "-",
  "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "·": "-", "•": "-", "✓": "ok", "✗": "x",
};

function makeSanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string): string =>
    Array.from(String(text ?? "").replace(/\r\n?|\t/g, " ").replace(/\n+/g, " "))
      .map((ch) => {
        if (REPLACEMENTS[ch]) return REPLACEMENTS[ch];
        return supported.has(ch.codePointAt(0)!) ? ch : "?";
      })
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    // Break words that are wider than the line (long ids, urls).
    let w = word;
    while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
      let cut = w.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
      if (line) { lines.push(line); line = ""; }
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function buildReportPdf(snapshot: ReportSnapshot, input: ReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(font);
  const pages: PDFPage[] = [];
  let page = pdf.addPage(PAGE);
  pages.push(page);
  let y = PAGE[1] - MARGIN;
  const maxWidth = PAGE[0] - MARGIN * 2;

  const newPage = () => {
    page = pdf.addPage(PAGE);
    pages.push(page);
    y = PAGE[1] - MARGIN;
  };

  /** Draws wrapped text on the CURRENT page, starting a new page whenever the next line would not fit. */
  const draw = (text: string, o: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) => {
    const size = o.size ?? 9;
    const f = o.bold ? bold : font;
    const indent = o.indent ?? 0;
    const color = o.color ? rgb(...o.color) : rgb(0.06, 0.1, 0.16);
    for (const line of wrap(clean(text), f, size, maxWidth - indent)) {
      if (y - size < BOTTOM) newPage();
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font: f, color });
      y -= size + 4;
    }
  };
  const heading = (t: string) => {
    y -= 6;
    if (y - 30 < BOTTOM) newPage();
    draw(t, { bold: true, size: 11 });
  };

  draw(`EvalAI - ${input.mode} report - ${input.pack}`, { size: 8, color: MUTED });
  draw(input.siteName, { size: 16, bold: true });
  draw(
    `Snapshot ${snapshot.id} - Assessment v${snapshot.assessmentVersion} - Checklist ${snapshot.checklistVersion}` +
      `${snapshot.materialsVersion ? ` - Materials v${snapshot.materialsVersion}` : ""}${snapshot.quotationVersion ? ` - Quotation v${snapshot.quotationVersion}` : ""}` +
      ` - ${snapshot.finalized ? "Finalized (immutable)" : "Draft"} - ${snapshot.createdAt}`,
    { size: 7, color: MUTED },
  );

  heading("Scope & context");
  draw(String(input.context.goal ?? input.context.scope ?? "-"), { size: 9 });

  if (input.narrative?.summary?.trim()) {
    heading("Summary");
    draw(input.narrative.summary, { size: 9 });
  }

  heading("Checklist outcomes");
  for (const r of input.checklist) draw(`- ${r.title} - ${r.status}${r.notes ? ` - ${r.notes}` : ""}`, { size: 9 });
  draw("Not Checked is not Pass. Pass requires an actual check and supporting evidence.", { size: 7, color: MUTED });

  heading("Measurements");
  if (input.measurements.length === 0) draw("No measurements recorded", { size: 9, color: MUTED });
  for (const m of input.measurements) draw(`${m.name}: ${Number.isFinite(Number(m.value)) ? m.value : "-"} ${m.unit}`, { size: 9 });

  heading("Findings");
  if (input.findings.length === 0) draw("No confirmed findings recorded", { size: 9, color: MUTED });
  for (const f of input.findings) {
    const unconfirmed = (f.status ?? "confirmed") !== "confirmed";
    draw(`- ${f.title}${f.severity ? ` (${f.severity})` : ""}${unconfirmed ? " [UNCONFIRMED]" : ""}`, { size: 9, bold: true });
    if (f.description) draw(f.description, { size: 8, indent: 10 });
    if (f.uncertainty) draw(`Uncertainty: ${f.uncertainty}`, { size: 8, indent: 10, color: [0.57, 0.25, 0.05] });
    draw(`Evidence linked: ${f.evidenceCount ?? "-"}`, { size: 7, indent: 10, color: MUTED });
  }

  heading("Materials - traceable");
  if (input.materials?.length) {
    for (const mat of input.materials) draw(`- ${mat.description} - ${mat.quantity} ${mat.unit}${mat.provisional ? " (provisional)" : ""} - ${mat.rationale}`, { size: 9 });
  } else {
    draw("No materials - report without materials list", { size: 9, color: MUTED });
  }
  if (input.quotation) draw(`Quotation: ${input.quotation.supplier} - ${input.quotation.total} ${input.quotation.currency} (from supplied quotation)`, { size: 9 });

  if (input.narrative?.recommendations?.trim()) {
    heading("Recommendations");
    draw(input.narrative.recommendations, { size: 9 });
  }

  heading("Completeness, limitations & uncertainty");
  if (input.limitations.length === 0) draw("None stated.", { size: 9, color: MUTED });
  for (const l of input.limitations) draw(`- ${l}`, { size: 9 });

  if (input.narrative?.notes?.trim()) {
    heading("Reviewer notes");
    draw(input.narrative.notes, { size: 9 });
  }

  heading("Review and sign-off");
  if (snapshot.finalized && snapshot.reviewedAt) {
    draw(`Reviewed and signed off by ${snapshot.reviewedByLabel ?? "a workspace member"} on ${snapshot.reviewedAt}.${snapshot.reviewNote ? " Note: " + snapshot.reviewNote : ""}`, { size: 9 });
  } else {
    draw(snapshot.finalized ? "Finalized." : "DRAFT - not yet reviewed or signed off. Do not rely on this document.", { size: 9, color: [0.57, 0.25, 0.05] });
  }

  heading("Important notice");
  draw(REPORT_DISCLAIMER, { size: 8, color: MUTED });

  // Footer on every page: page numbers + version identity.
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawText(clean(`Snapshot ${snapshot.id} - ${snapshot.finalized ? "Finalized" : "Draft"} - Page ${i + 1} of ${total}`), { x: MARGIN, y: 30, size: 7, font, color: rgb(...MUTED) });
    p.drawText("Generated from a versioned snapshot - later edits create new versions, never mutate finalized reports.", { x: MARGIN, y: 20, size: 6, font, color: rgb(...MUTED) });
  });

  return pdf.save();
}
