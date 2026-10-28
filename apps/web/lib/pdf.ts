import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportInput, ReportSnapshot } from "@eval-ai/shared";

// Deterministic PDF from versioned snapshot — no AI regeneration at export
// Uses saved facts + snapshot versions only; later edits create new snapshots

export async function buildReportPdf(snapshot: ReportSnapshot, input: ReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  let y = height - 40;

  const draw = (text: string, opts: { x?: number; y?: number; size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 9;
    const color = opts.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0.06, 0.1, 0.16);
    page.drawText(text.slice(0, 120), { x: opts.x ?? 40, y: opts.y ?? y, size, font: opts.bold ? bold : font, color });
    if (opts.y === undefined) y -= size + 4;
  };

  draw(`EvalAI — ${input.mode} report · ${input.pack}`, { size: 8, color: [0.39, 0.45, 0.55] });
  draw(input.siteName, { size: 16, bold: true });
  draw(`Snapshot ${snapshot.id} · Assessment v${snapshot.assessmentVersion} · Checklist ${snapshot.checklistVersion}${snapshot.materialsVersion ? ` · Materials v${snapshot.materialsVersion}` : ""}${snapshot.quotationVersion ? ` · Quotation v${snapshot.quotationVersion}` : ""} · ${snapshot.finalized ? "Finalized (immutable)" : "Draft"} · ${snapshot.createdAt}`, { size: 7, color: [0.39, 0.45, 0.55] });
  y -= 8;
  draw("Scope & context", { bold: true, size: 10 });
  draw(String(input.context.goal ?? input.context.scope ?? "—").slice(0, 200), { size: 8 });
  y -= 4;
  draw("Checklist outcomes", { bold: true, size: 10 });
  for (const r of input.checklist.slice(0, 15)) {
    draw(`• ${r.title} — ${r.status}${r.notes ? ` — ${r.notes.slice(0, 60)}` : ""}`, { size: 8 });
    if (y < 80) { y = height - 40; pdf.addPage([595, 842]); }
  }
  y -= 4;
  draw("Measurements", { bold: true, size: 10 });
  for (const m of input.measurements) draw(`${m.name}: ${m.value} ${m.unit}`, { size: 8 });
  if (input.measurements.length === 0) draw("No measurements recorded", { size: 8, color: [0.39, 0.45, 0.55] });
  y -= 4;
  draw("Materials — traceable", { bold: true, size: 10 });
  if (input.materials?.length) {
    for (const mat of input.materials) draw(`${mat.description} — ${mat.quantity} ${mat.unit}${mat.provisional ? " (provisional)" : ""} — ${mat.rationale.slice(0, 80)}`, { size: 8 });
  } else {
    draw("No materials — report without materials list", { size: 8, color: [0.39, 0.45, 0.55] });
  }
  if (input.quotation) draw(`Quotation: ${input.quotation.supplier} — ${input.quotation.total} ${input.quotation.currency} (from supplied quotation)`, { size: 8 });
  y -= 4;
  draw("Limitations", { bold: true, size: 10 });
  for (const l of input.limitations.slice(0, 5)) draw(`• ${l.slice(0, 100)}`, { size: 8 });

  draw("Generated from versioned snapshot — later edits create new versions, never mutate finalized reports.", { size: 6, color: [0.39, 0.45, 0.55], y: 30, x: 40 });

  return pdf.save();
}
