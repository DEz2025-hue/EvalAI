import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DEFAULT_ACCENT, PRIORITY_LABEL, REPORT_DISCLAIMER, resolveTemplate, type SectionId, checklistGlance, glanceSentence, groupByCategory, keyFindingsFor, photoNumbers, recommendedActions, reportLayout, scenarioFor, scenarioLabel, siteBriefLines, statusLabel, type ReportChecklistRow, type ReportInput, type ReportPhoto, type ReportSnapshot } from "@eval-ai/shared";

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

/** "#b91c1c" as the 0 to 1 colour values the PDF library takes. The colour was already checked when the template was saved. */
function hexToRgb(hex: string): [number, number, number] {
  const n = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!n) return [0.06, 0.1, 0.16];
  const v = parseInt(n[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
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
  // The office's report style (D-031). With no template the colours, headings and order are exactly as before.
  const tpl = resolveTemplate(input.template);
  const accent: [number, number, number] | undefined = tpl.accentColor !== DEFAULT_ACCENT ? hexToRgb(tpl.accentColor) : undefined;
  /** A heading the template renamed, or the built-in one. */
  const T = (id: SectionId, fallback: string) => tpl.custom(id) ?? fallback;
  const heading = (t: string) => {
    y -= 6;
    if (y - 30 < BOTTOM) newPage();
    draw(t, { bold: true, size: 11, ...(accent ? { color: accent } : {}) });
  };

  const situation = scenarioFor(input.mode, input.context?.scenario);
  if (tpl.logo) {
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(tpl.logo);
    if (m) {
      try {
        const img = m[1] === "png" ? await pdf.embedPng(Buffer.from(m[2], "base64")) : await pdf.embedJpg(Buffer.from(m[2], "base64"));
        const scale = Math.min(150 / img.width, 44 / img.height, 1);
        page.drawImage(img, { x: MARGIN, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
        y -= img.height * scale + 6;
      } catch {
        /* a logo that cannot be read is left out; the report still prints */
      }
    }
  }
  draw(`${tpl.officeName ?? "EvalAI"} - ${input.mode} report - ${input.pack}${situation ? " - " + scenarioLabel(situation) : ""}`, { size: 8, color: MUTED });
  draw(input.siteName, { size: 16, bold: true, ...(accent ? { color: accent } : {}) });
  draw(
    `Snapshot ${snapshot.id} - Assessment v${snapshot.assessmentVersion} - Checklist ${snapshot.checklistVersion}` +
      `${snapshot.materialsVersion ? ` - Materials v${snapshot.materialsVersion}` : ""}${snapshot.quotationVersion ? ` - Quotation v${snapshot.quotationVersion}` : ""}` +
      ` - ${snapshot.finalized ? "Finalized (immutable)" : "Draft"} - ${snapshot.createdAt}`,
    { size: 7, color: MUTED },
  );
  if (tpl.headerText) draw(tpl.headerText, { size: 8, color: MUTED });

  const narrative = input.narrative ?? {};
  const has = (t?: string) => !!(t && t.trim());
  const checklist = input.checklist ?? [];
  const glance = checklistGlance(checklist);
  const layout = reportLayout(input);
  const numbers = photoNumbers(input);
  const photos = input.photos ?? [];
  const measuredText = (r: ReportChecklistRow) => (r.measured && Number.isFinite(Number(r.measured.value)) ? `Measured: ${r.measured.value} ${r.measured.unit}` : "");

  /** A photo with the AI's description of it, always marked as not verified (D-022). */
  const drawPhoto = async (p: ReportPhoto, n: number, box: { w: number; h: number }) => {
    draw(`Photo ${n}${p.itemTitle ? " - " + p.itemTitle : ""}`, { size: 9, bold: true, indent: 10 });
    const m = typeof p.thumbnail === "string" ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(p.thumbnail) : null;
    if (m) {
      try {
        const img = await pdf.embedJpg(Buffer.from(m[1], "base64"));
        const scale = Math.min(box.w / img.width, box.h / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        if (y - h < BOTTOM) newPage();
        page.drawImage(img, { x: MARGIN + 10, y: y - h, width: w, height: h });
        y -= h + 6;
      } catch {
        draw("(The picture could not be shown.)", { size: 7, indent: 10, color: MUTED });
      }
    }
    if (p.caption) draw(`${p.caption} [AI description, not verified]`, { size: 8, indent: 10 });
    for (const o of p.observations) draw(`- ${o}`, { size: 8, indent: 14 });
    if (p.cannotTell.length) draw(`Cannot be told from this photo: ${p.cannotTell.join("; ")}`, { size: 7, indent: 10, color: MUTED });
    y -= 4;
  };

  const drawSite = () => {
    heading(T("siteScope", "Site and scope"));
    if (has(narrative.siteOverview)) draw(narrative.siteOverview!, { size: 9 });
    const brief = siteBriefLines(input.siteBrief, input.context?.goal ?? input.context?.scope);
    if (brief.length === 0 && !has(narrative.siteOverview)) draw("-", { size: 9 });
    for (const l of brief) draw(`${l.label}: ${l.value}`, { size: 9 });
    const answered = (input.siteBrief?.answers ?? []).filter((a) => a.answer?.trim());
    if (answered.length > 0) {
      draw("Scope questions", { size: 9, bold: true });
      for (const a of answered) draw(`- ${a.question} ${a.answer}`, { size: 8, indent: 8 });
    }
  };

  const drawInterview = () => {
    const iv = input.siteBrief?.interview;
    if (!iv || (iv.details.length === 0 && iv.statements.length === 0)) return;
    heading(T("interview", "Site interview"));
    draw("What the person said when asked about the job. These are statements, not verified facts.", { size: 7, color: MUTED });
    for (const d of iv.details) draw(`${d.label}: ${d.value}`, { size: 9 });
    for (const s of iv.statements) draw(`- ${s.question} ${s.answer}`, { size: 8, indent: 8 });
    if (iv.openQuestions.length > 0) draw(`Left open in the interview: ${iv.openQuestions.join("; ")}`, { size: 8, color: MUTED });
  };

  // Photos cited inside a finding are shown there; the rest go in the photos section. A hidden findings section cites none.
  const findings = layout === "findings" ? keyFindingsFor(input) : [];
  const citedPhotos = new Set(layout === "findings" && tpl.order.includes("keyFindings") ? findings.flatMap((f) => f.basis.filter((b) => b.kind === "photo").map((b) => b.ref)) : []);

  const sections: Record<SectionId, () => Promise<void> | void> = {
    summary: () => {
      if (has(narrative.summary)) {
        heading(T("summary", "Executive summary"));
        draw(narrative.summary!, { size: 9 });
      }
      if (layout === "findings") {
        draw(`At a glance: ${glanceSentence(glance)}`, { size: 7, color: MUTED });
      } else {
        heading("Report at a glance");
        draw(glanceSentence(glance), { size: 9 });
        if (glance.requiredOpen.length > 0) {
          draw("Required items still Not Checked:", { size: 8, color: MUTED });
          for (const r of glance.requiredOpen) draw(`- ${r.title}`, { size: 9, indent: 8 });
        }
      }
    },
    siteScope: drawSite,
    interview: drawInterview,
    keyFindings: async () => {
      if (layout === "findings") {
        heading(T("keyFindings", "Key findings"));
        if (findings.length === 0) draw("No findings, issues or items needing attention were recorded.", { size: 9, color: MUTED });
        for (const [i, f] of findings.entries()) {
          y -= 4;
          const status = f.confirmed ? "confirmed by the reviewer" : f.source === "ai" ? "AI draft, not yet confirmed" : "";
          draw(`${i + 1}. ${f.title}  [${PRIORITY_LABEL[f.priority]}]${status ? "  (" + status + ")" : ""}`, { size: 10, bold: true });
          if (has(f.observed)) { draw("Observed", { size: 8, bold: true, indent: 10, color: MUTED }); draw(f.observed, { size: 9, indent: 10 }); }
          if (has(f.meaning)) { draw("What it means (interpretation, including general technical knowledge)", { size: 8, bold: true, indent: 10, color: MUTED }); draw(f.meaning, { size: 9, indent: 10 }); }
          if (has(f.action)) { draw("Recommended action", { size: 8, bold: true, indent: 10, color: MUTED }); draw(f.action, { size: 9, indent: 10 }); }
          const sources = f.basis
            .map((b) => (b.kind === "photo" ? (numbers.has(b.ref) ? `Photo ${numbers.get(b.ref)}` : "") : b.kind === "item" ? `Checklist: ${b.ref}` : b.kind === "measurement" ? `Measurement: ${b.ref}` : `Finding: ${b.ref}`))
            .filter(Boolean);
          if (sources.length) draw(`Based on: ${sources.join("; ")}`, { size: 7, indent: 10, color: MUTED });
          if (f.evidenceCount !== undefined) draw(`Evidence linked: ${f.evidenceCount}`, { size: 7, indent: 10, color: MUTED });
          for (const p of photos.filter((ph) => f.basis.some((b) => b.kind === "photo" && b.ref === ph.evidenceId))) await drawPhoto(p, numbers.get(p.evidenceId) ?? 0, { w: 160, h: 120 });
        }
        return;
      }
      heading(T("keyFindings", "What was found, by area"));
      if (has(narrative.observations)) {
        draw(narrative.observations!, { size: 9 });
      } else {
        const done = groupByCategory(checklist.filter((r) => r.status !== "not_checked"));
        if (done.length === 0) draw("Nothing has been checked yet.", { size: 9, color: MUTED });
        for (const g of done) {
          draw(g.category, { size: 9, bold: true });
          for (const r of g.rows) draw(`- ${r.title} - ${statusLabel(r.status)}${r.notes ? ` - ${r.notes}` : ""}`, { size: 9, indent: 8 });
        }
      }

      heading("Issues and risks");
      if (has(narrative.issues)) draw(narrative.issues!, { size: 9 });
      draw("Findings", { size: 9, bold: true });
      if (input.findings.length === 0) draw("No confirmed findings recorded", { size: 9, color: MUTED });
      for (const f of input.findings) {
        const unconfirmed = (f.status ?? "confirmed") !== "confirmed";
        draw(`- ${f.title}${f.severity ? ` (${f.severity})` : ""}${unconfirmed ? " [UNCONFIRMED]" : ""}`, { size: 9, bold: true });
        if (f.description) draw(f.description, { size: 8, indent: 10 });
        if (f.uncertainty) draw(`Uncertainty: ${f.uncertainty}`, { size: 8, indent: 10, color: [0.57, 0.25, 0.05] });
        draw(`Evidence linked: ${f.evidenceCount ?? "-"}`, { size: 7, indent: 10, color: MUTED });
      }
      if (glance.flagged.length > 0) {
        draw("Flagged during the checklist", { size: 9, bold: true });
        for (const r of glance.flagged) {
          draw(`- ${r.title} - ${statusLabel(r.status)}${r.notes ? ` - ${r.notes}` : ""}`, { size: 9, indent: 8 });
          if (measuredText(r)) draw(measuredText(r), { size: 7, indent: 14, color: MUTED });
        }
      }
    },
    actions: () => {
      if (layout === "findings") {
        const actions = recommendedActions(findings);
        if (actions.length > 0) {
          heading(T("actions", "Recommended actions"));
          for (const a of actions) draw(`- [${PRIORITY_LABEL[a.priority]}] ${a.title}. ${a.action}`, { size: 9 });
        }
        if (has(narrative.recommendations)) {
          heading("Additional recommendations");
          draw(narrative.recommendations!, { size: 9 });
        }
      } else if (has(narrative.recommendations)) {
        heading(T("actions", "Recommended next steps"));
        draw(narrative.recommendations!, { size: 9 });
      }
    },
    // Photos (D-022) not already shown inside a finding: small pictures with what an AI saw, always marked as not verified.
    photos: async () => {
      const otherPhotos = photos.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => !citedPhotos.has(p.evidenceId));
      if (otherPhotos.length === 0) return;
      heading(T("photos", citedPhotos.size > 0 ? "Other photos" : "Photos and what was seen"));
      draw("Descriptions were written by an AI from each photo and have not been verified by a person. They are not findings or measurements.", { size: 7, color: MUTED });
      for (const { p, n } of otherPhotos) await drawPhoto(p, n, { w: 200, h: 150 });
      const issues = otherPhotos.flatMap(({ p, n }) => p.possibleIssues.map((x) => ({ photo: n, text: x.text, confidence: x.confidence })));
      if (issues.length > 0) {
        heading("Possible issues seen in photos (AI, not verified)");
        draw("Things an AI noticed that a person should check. They are not confirmed findings and are not part of the findings above.", { size: 7, color: MUTED });
        for (const x of issues) draw(`- ${x.text} (Photo ${x.photo}, ${x.confidence === "high" ? "likely" : x.confidence === "medium" ? "possible" : "unclear"})`, { size: 9 });
      }
    },
    materials: () => {
      heading(T("materials", "Materials - traceable"));
      if (input.materials?.length) {
        for (const mat of input.materials) {
          const qty = mat.quantityTbd ? "TBD" : `${mat.quantity} ${mat.unit}`;
          draw(`- ${mat.description}${mat.source === "ai_suggested" ? " [AI suggestion]" : ""} - ${qty}${mat.provisional || mat.quantityTbd ? " (provisional)" : ""} - ${mat.rationale}`, { size: 9 });
          if (mat.specification) draw(`    Specification: ${mat.specification}`, { size: 8, color: MUTED });
        }
        if (input.materials.some((m) => m.source === "ai_suggested" || m.quantityTbd)) draw("Items marked AI suggestion were proposed from the recorded measurements and general rules. Quantities marked provisional or TBD must be confirmed. This list is not a quotation and not a design.", { size: 7, color: MUTED });
      } else {
        draw("No materials - report without materials list", { size: 9, color: MUTED });
      }
      if (input.quotation) draw(`Quotation: ${input.quotation.supplier} - ${input.quotation.total} ${input.quotation.currency} (from supplied quotation)`, { size: 9 });
    },
    openItems: () => {
      heading(T("openItems", "Open items, limitations & uncertainty"));
      if (has(narrative.openItems)) draw(narrative.openItems!, { size: 9 });
      if (input.limitations.length === 0) draw("None stated.", { size: 9, color: MUTED });
      for (const l of input.limitations) draw(`- ${l}`, { size: 9 });
    },
    appendixChecklist: () => {
      heading(T("appendixChecklist", "Appendix A - Checklist results"));
      if (checklist.length === 0) draw("No checklist items recorded", { size: 9, color: MUTED });
      for (const g of groupByCategory(checklist)) {
        draw(g.category, { size: 9, bold: true });
        for (const r of g.rows) {
          draw(`- ${r.title}${r.required ? " (required)" : ""} - ${statusLabel(r.status)}${r.notes ? ` - ${r.notes}` : ""}`, { size: 9, indent: 8 });
          const extra = [measuredText(r), r.evidenceCount ? `${r.evidenceCount} photo${r.evidenceCount === 1 ? "" : "s"} linked` : ""].filter(Boolean).join(" - ");
          if (extra) draw(extra, { size: 7, indent: 14, color: MUTED });
        }
      }
      draw("Not Checked is not Pass. Pass requires an actual check and supporting evidence.", { size: 7, color: MUTED });
    },
    appendixMeasurements: () => {
      heading(T("appendixMeasurements", "Appendix B - Measurements"));
      if (input.measurements.length === 0) draw("No measurements recorded", { size: 9, color: MUTED });
      for (const m of input.measurements) draw(`${m.name}: ${Number.isFinite(Number(m.value)) ? m.value : "-"} ${m.unit}`, { size: 9 });
    },
  };
  for (const id of tpl.order) await sections[id]();

  // Not controlled by the template: reviewer notes, the review status or sign-off, and the important notice are always printed.
  if (has(narrative.notes)) {
    heading("Reviewer notes");
    draw(narrative.notes!, { size: 9 });
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
    if (tpl.footerText) p.drawText(clean(tpl.footerText), { x: MARGIN, y: 40, size: 7, font, color: rgb(...MUTED) });
    p.drawText("Generated from a versioned snapshot - later edits create new versions, never mutate finalized reports.", { x: MARGIN, y: 20, size: 6, font, color: rgb(...MUTED) });
  });

  return pdf.save();
}
