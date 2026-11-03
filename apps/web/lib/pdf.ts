import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { HIGHLIGHT_NOTE, highlightGroups, DORI_LABEL, SYSTEM_RANGES, cameraFix, cctvSizedEquipment, cctvSizing, CAMERA_TYPE_LABEL, DECISION_BASIS_LABEL, LOAD_SOURCE_LABEL, SIZING_RANGES, SYSTEM_TYPE_LABEL, designCounts, kilo, sizedEquipment, solarSizing, DEFAULT_ACCENT, PRIORITY_LABEL, REPORT_DISCLAIMER, resolveTemplate, type SectionId, checklistGlance, glanceSentence, groupByCategory, keyFindingsFor, photoNumbers, projectPlanNote, recommendedActions, reportLayout, scenarioFor, scenarioLabel, siteBriefLines, statusLabel, type ReportChecklistRow, type ReportInput, type ReportPhoto, type ReportSnapshot } from "@eval-ai/shared";

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

  /**
   * A table with wrapped cells. `widths` are fractions of the page width. A row never splits across pages; the header row is drawn
   * again at the top of each new page.
   */
  const table = (head: string[], rows: string[][], widths: number[], o: { size?: number; boldFirst?: boolean } = {}) => {
    if (rows.length === 0) return;
    const size = o.size ?? 8;
    const pad = 3;
    const lineH = size + 3;
    const cols = widths.map((w) => w * maxWidth);
    const drawRow = (cells: string[], isHead: boolean) => {
      const fontOf = (i: number) => (isHead || (o.boldFirst && i === 0) ? bold : font);
      const wrapped = cells.map((c, i) => wrap(clean(c), fontOf(i), size, cols[i] - pad * 2));
      const h = Math.max(...wrapped.map((w) => w.length)) * lineH + pad * 2;
      if (y - h < BOTTOM) {
        newPage();
        if (!isHead) drawRow(head, true);
      }
      if (isHead) page.drawRectangle({ x: MARGIN, y: y - h, width: maxWidth, height: h, color: rgb(0.97, 0.98, 0.99) });
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, j) => page.drawText(line, { x: x + pad, y: y - pad - size - j * lineH + 1, size, font: fontOf(i), color: isHead ? rgb(...MUTED) : rgb(0.06, 0.1, 0.16) }));
        x += cols[i];
      });
      y -= h;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + maxWidth, y }, thickness: 0.5, color: rgb(0.89, 0.91, 0.94) });
    };
    y -= 2;
    drawRow(head, true);
    for (const r of rows) drawRow(r, false);
    y -= 6;
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
  const kind = reportLayout(input) === "solar" ? "Solar design and sizing proposal" : reportLayout(input) === "design" ? "CCTV system design proposal" : `${input.mode} report - ${input.pack}${situation ? " - " + scenarioLabel(situation) : ""}`;
  draw(`${tpl.officeName ?? "EvalAI"} - ${kind}`, { size: 8, color: MUTED });
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
  const design = layout === "design" ? narrative.design ?? null : null;
  // The CCTV system sizing (D-037), worked out in code from the camera plan and settings.
  const cz = design ? cctvSizing(design) : null;
  const solar = layout === "solar" ? narrative.solar ?? null : null;
  const sized = solar ? solarSizing(solar) : null;
  const numbers = photoNumbers(input);
  const photos = input.photos ?? [];
  const measuredText = (r: ReportChecklistRow) => (r.measured && Number.isFinite(Number(r.measured.value)) ? `Measured: ${r.measured.value} ${r.measured.unit}` : "");

  /** A photo with the AI's description of it, always marked as not verified (D-022). */
  const drawPhoto = async (p: ReportPhoto, n: number, box: { w: number; h: number }) => {
    draw(`Photo ${n}${p.itemTitle ? " - " + p.itemTitle : ""}`, { size: 9, bold: true, indent: 10 });
    const m = typeof p.thumbnail === "string" ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(p.thumbnail) : null;
    const groups = m ? highlightGroups(p) : [];
    let drawn = false;
    if (m) {
      try {
        const img = await pdf.embedJpg(Buffer.from(m[1], "base64"));
        // A photo with outlines is printed larger, so the outlines can be read.
        const fit = groups.length ? { w: 340, h: 260 } : box;
        const scale = Math.min(fit.w / img.width, fit.h / img.height, groups.length ? 2 : 1);
        const w = img.width * scale;
        const h = img.height * scale;
        if (y - h < BOTTOM) newPage();
        page.drawImage(img, { x: MARGIN + 10, y: y - h, width: w, height: h });
        const RED = rgb(0.86, 0.15, 0.15);
        for (const g of groups) {
          for (const a of g.areas) {
            const left = MARGIN + 10 + a.x * w;
            const top = y - a.y * h;
            page.drawRectangle({ x: left, y: top - a.h * h, width: a.w * w, height: a.h * h, borderColor: RED, borderWidth: 1.5 });
            page.drawRectangle({ x: left, y: top - 10, width: 10, height: 10, color: RED });
            page.drawText(g.letter, { x: left + 2, y: top - 8, size: 8, font: bold, color: rgb(1, 1, 1) });
          }
        }
        drawn = true;
        y -= h + 6;
      } catch {
        draw("(The picture could not be shown.)", { size: 7, indent: 10, color: MUTED });
      }
    }
    if (drawn && groups.length) {
      draw(HIGHLIGHT_NOTE, { size: 7, indent: 10, color: MUTED });
      for (const g of groups) draw(`${g.letter}: ${g.label}`, { size: 8, indent: 10 });
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
      if (solar && sized) {
        // Every size is worked out by code from the load schedule and inputs (D-036), never taken from the AI's prose.
        draw(`The proposed system: ${SYSTEM_TYPE_LABEL[solar.inputs.systemType]}`, { size: 9, bold: true });
        table(
          ["Solar array", "Panels", "Inverter", "Battery", "Daily need", "Daily production"],
          [[kilo(sized.arrayWp, "Wp"), `${sized.panelCount} x ${solar.inputs.panelWatts.value} W`, kilo(sized.inverterW, "W"), sized.batteryNominalWh > 0 ? kilo(sized.batteryNominalWh, "Wh") : "None", kilo(sized.dailyWh, "Wh"), kilo(sized.dailyProductionWh, "Wh")]],
          [0.17, 0.17, 0.15, 0.15, 0.17, 0.19],
        );
        draw("Expected production is an average day at the assumed sun hours; cloudy days produce less.", { size: 7, color: MUTED });
      } else if (design) {
        // Counted from the camera schedule, never taken from the AI's prose (D-034).
        const c = designCounts(design);
        draw(`The proposed system: ${c.total} camera${c.total === 1 ? "" : "s"}`, { size: 9, bold: true });
        table(["Area", "Cameras"], [...c.byArea.map((a) => [a.name, String(a.count)]), ["Total", String(c.total)]], [0.7, 0.3]);
        table(["Camera type", "Quantity", "Where"], c.byType.map((t) => [t.label, String(t.count), t.where.join(", ")]), [0.3, 0.12, 0.58]);
      } else if (layout === "findings") {
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
      if (solar && sized) {
        heading("Design basis");
        table(["Item", "Decision", "Basis"], solar.basis.map((b) => [b.item, b.decision, DECISION_BASIS_LABEL[b.basis]]), [0.26, 0.6, 0.14], { boldFirst: true });
        draw(`System type: ${SYSTEM_TYPE_LABEL[solar.inputs.systemType]}`, { size: 9 });
        heading("Load schedule");
        draw("Power per unit and daily hours, with where each figure came from. Typical values and assumptions must be confirmed.", { size: 7, color: MUTED });
        table(
          ["Load", "Qty", "Watts each", "Hours/day", "Wh/day", "Source"],
          [...solar.loads.map((l) => [l.name + (l.motor ? " (start-up surge)" : ""), String(l.quantity), String(l.watts), String(l.hoursPerDay), String(Math.round(l.quantity * l.watts * l.hoursPerDay)), LOAD_SOURCE_LABEL[l.source]]), ["Total", "", String(Math.round(sized.connectedW)), "", String(Math.round(sized.dailyWh)), ""]],
          [0.34, 0.08, 0.13, 0.12, 0.13, 0.2],
          { boldFirst: true },
        );
        draw("What drives the size: " + sized.loadShares.slice(0, 4).map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(", "), { size: 8 });
        heading("Sizing");
        draw("Worked out by the app from the load schedule and the inputs, not written by the AI.", { size: 7, color: MUTED });
        table(["Input", "Value", "Basis", "Note"], (Object.keys(SIZING_RANGES) as Array<keyof typeof SIZING_RANGES>).map((k) => [SIZING_RANGES[k].label, `${solar.inputs[k].value}${SIZING_RANGES[k].unit ? " " + SIZING_RANGES[k].unit : ""}`, DECISION_BASIS_LABEL[solar.inputs[k].basis], solar.inputs[k].note]), [0.3, 0.14, 0.14, 0.42], { boldFirst: true });
        table(["Step", "How it is worked out", "Result"], sized.steps.map((st) => [st.label, st.formula, `${st.value.toLocaleString("en-US")} ${st.unit}`]), [0.26, 0.54, 0.2], { boldFirst: true });
        if (solar.placement.length) {
          heading("Panel placement");
          for (const p of solar.placement) draw(`- ${p}`, { size: 9 });
        }
        if (solar.options.length) {
          heading("Options for the client");
          table(["Topic", "Choice", "What it would change"], solar.options.map((o) => [o.area, o.gap, o.option]), [0.22, 0.4, 0.38]);
        }
        return;
      }
      if (design) {
        heading("Design basis");
        table(["Item", "Decision", "Basis"], design.basis.map((b) => [b.item, b.decision, DECISION_BASIS_LABEL[b.basis]]), [0.26, 0.6, 0.14], { boldFirst: true });
        if (design.basis.some((b) => b.basis === "assumption")) draw("Decisions marked Assumption were proposed by the designer and must be confirmed with the client.", { size: 7, color: MUTED });
        if (design.approach.length) {
          draw("Design approach", { size: 9, bold: true });
          for (const a of design.approach) draw(`- ${a}`, { size: 9, indent: 8 });
        }
        heading("Camera plans");
        for (const a of design.areas) {
          y -= 4;
          draw(`${a.name} - ${a.cameras.length} camera${a.cameras.length === 1 ? "" : "s"}`, { size: 10, bold: true });
          table(
            ["ID", "Location", "Type", "Purpose", "Detail needed"],
            a.cameras.map((c) => {
              const k = cz?.cameras.find((x) => x.id === c.id);
              return [c.id, c.location, CAMERA_TYPE_LABEL[c.type], c.purpose, k ? `${DORI_LABEL[k.detail]} at ${k.distanceM} m - ${k.meets ? "ok" : "SHORT"} (${Math.round(k.pxPerM)} px/m)` : ""];
            }),
            [0.08, 0.3, 0.16, 0.24, 0.22],
            { boldFirst: true },
          );
          for (const n of a.notes) draw(`- ${n}`, { size: 8, indent: 8 });
          if (a.uncovered.length) draw(`- No camera inside: ${a.uncovered.join("; ")}.`, { size: 8, indent: 8 });
        }
        if (cz) {
          const s = cz.system;
          heading("System design");
          draw("Worked out by the app from the camera plan and the settings, not written by the AI. Detail levels follow the published DORI pixel densities; assumed figures must be confirmed.", { size: 7, color: MUTED });
          table(
            ["Bandwidth", "Storage", "Drives", "Recorder", "PoE", "UPS"],
            [[`${Math.round(cz.bandwidthMbps * 10) / 10} Mbps`, `${Math.round(cz.storageWithHeadroomTb * 10) / 10} TB`, `${cz.drives} x ${s.driveTb.value} TB`, `${cz.recorderChannels} ch`, `${cz.poeTotalW} W`, `${cz.upsVa} VA`]],
            [0.17, 0.17, 0.17, 0.15, 0.14, 0.2],
          );
          if (cz.failing.length) {
            draw("Cameras short of the detail they need", { size: 9, bold: true });
            table(["Camera", "What to change"], cz.failing.map((c) => [`${c.id} ${c.location}`, cameraFix(c)]), [0.34, 0.66]);
          } else draw("Every camera gives the detail it needs at its distance, as planned.", { size: 9 });
          table(
            ["Setting", "Value", "Basis", "Note"],
            [
              ["Codec", s.codec === "h264" ? "H.264" : "H.265", "", ""],
              ["Recording", s.recording === "motion" ? "On motion" : "Continuous", "", ""],
              ...(Object.keys(SYSTEM_RANGES) as Array<keyof typeof SYSTEM_RANGES>)
                .filter((k) => k !== "motionShare" || s.recording === "motion")
                .map((k) => [SYSTEM_RANGES[k].label, `${s[k].value}${SYSTEM_RANGES[k].unit ? " " + SYSTEM_RANGES[k].unit : ""}`, DECISION_BASIS_LABEL[s[k].basis], s[k].note]),
            ],
            [0.32, 0.18, 0.14, 0.36],
            { boldFirst: true },
          );
          table(["Step", "How it is worked out", "Result"], cz.steps.map((st) => [st.label, st.formula, `${st.value.toLocaleString("en-US")} ${st.unit}`]), [0.24, 0.58, 0.18], { boldFirst: true });
          table(["Switch point", "Cameras", "PoE load", "Switch"], cz.switches.map((w) => [w.area, String(w.cameras), `${w.poeW} W`, `${w.ports}-port, at least ${w.budgetW} W${w.needsAt ? ", 802.3at ports" : ""}`]), [0.3, 0.12, 0.14, 0.44], { boldFirst: true });
        }
        if (design.options.length) {
          const c = designCounts(design);
          heading("Coverage review and optional additions");
          draw("These areas have no direct camera in the plan above. They are listed so the client can decide whether to add any. None of them are in the camera count.", { size: 8, color: MUTED });
          table(["Area", "Gap", "Option", "Extra cameras"], design.options.map((o) => [o.area, o.gap, o.option, o.extraCameras ? String(o.extraCameras) : "-"]), [0.2, 0.42, 0.26, 0.12]);
          if (c.optionalExtra) draw(`Taking all of them would add ${c.optionalExtra} camera${c.optionalExtra === 1 ? "" : "s"}, for a total of ${c.total + c.optionalExtra}.`, { size: 9 });
        }
        return;
      }
      if (layout === "findings") {
        heading(T("keyFindings", "Key findings"));
        if (findings.length === 0) draw(input.limitations.length ? "No item was marked as an issue, but this report has open items. See the open items section." : "No findings, issues or items needing attention were recorded.", { size: 9, color: MUTED });
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
      if (solar && sized) {
        heading("Equipment summary");
        draw("Quantities for planning. Prices are not included. The panels, inverter and battery follow from the sizing.", { size: 7, color: MUTED });
        table(["Item", "Qty", "Specification"], [...sizedEquipment(solar, sized), ...solar.equipment].map((e) => [e.item, e.quantity || "-", e.specification]), [0.32, 0.16, 0.52], { boldFirst: true });
        if (solar.installation.length) {
          heading("Installation approach");
          for (const st of solar.installation) draw(`- ${st}`, { size: 9 });
        }
        if (solar.nextSteps.length) {
          heading("Next steps");
          for (const st of solar.nextSteps) draw(`- ${st}`, { size: 9 });
        }
        if (has(narrative.recommendations)) {
          heading("Additional recommendations");
          draw(narrative.recommendations!, { size: 9 });
        }
        return;
      }
      if (design) {
        heading("Equipment summary");
        draw("Quantities for planning. Prices are not included. Camera quantities are counted from the camera schedule.", { size: 7, color: MUTED });
        const cameras = designCounts(design).byType.map((t) => [t.label, String(t.count), "From the camera schedule"]);
        const sized = cz ? cctvSizedEquipment(cz).map((e) => [e.item, e.quantity, e.specification + " (from the sizing)"]) : [];
        table(["Item", "Qty", "Specification"], [...cameras, ...sized, ...design.equipment.map((e) => [e.item, e.quantity || "-", e.specification])], [0.32, 0.16, 0.52], { boldFirst: true });
        if (design.installation.length) {
          heading("Installation approach");
          for (const s of design.installation) draw(`- ${s}`, { size: 9 });
        }
        if (design.nextSteps.length) {
          heading("Next steps");
          for (const s of design.nextSteps) draw(`- ${s}`, { size: 9 });
        }
        if (has(narrative.recommendations)) {
          heading("Additional recommendations");
          draw(narrative.recommendations!, { size: 9 });
        }
        return;
      }
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
    // The project plan (D-039): only on reports that hold one.
    projectPlan: () => {
      const plan = narrative.projectPlan;
      if (!plan) return;
      heading(T("projectPlan", "Project plan"));
      draw(projectPlanNote(plan), { size: 7, color: MUTED });
      if (plan.holds.length) {
        draw("Settle these before work starts", { size: 9, bold: true });
        table(
          ["Priority", "Why it matters", "What to do"],
          plan.holds.map((h) => {
            const sources = h.basis.map((b) => (b.kind === "photo" ? (numbers.has(b.ref) ? `Photo ${numbers.get(b.ref)}` : "") : b.ref)).filter(Boolean).join("; ");
            return [PRIORITY_LABEL[h.priority], `${h.title}. ${h.why}${sources ? ` (Based on: ${sources})` : ""}`, h.action];
          }),
          [0.12, 0.56, 0.32],
          { boldFirst: true },
        );
      }
      draw("How the project runs", { size: 9, bold: true });
      table(
        ["Phase", "Tasks", "Finished when"],
        plan.phases.map((p, i) => [`${i + 1}. ${p.name}${p.owner ? ` (${p.owner})` : ""}`, p.tasks.map((t) => `- ${t}`).join(" "), `${p.doneWhen}${p.holdPoint ? " HOLD POINT: sign off before the next phase." : ""}`]),
        [0.26, 0.46, 0.28],
        { boldFirst: true },
      );
    },
    materials: () => {
      // A design lists its equipment itself; the materials schedule only shows when materials were added to this draft.
      if ((design || solar) && !input.materials?.length && !input.quotation) return;
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
      const open = design?.openItems ?? solar?.openItems;
      if (open) {
        heading(T("openItems", "Assumptions and open items"));
        table(["Assumption or open item", "Status"], open.map((o) => [o.item, o.status]), [0.74, 0.26]);
        if (has(narrative.openItems)) draw(narrative.openItems!, { size: 9 });
        if (input.limitations.length) draw("Limits noted for this job:", { size: 8, color: MUTED });
        for (const l of input.limitations) draw(`- ${l}`, { size: 9 });
        return;
      }
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
          for (const a of r.answers ?? []) draw(`${a.label}: ${a.value}${a.concern ? " (needs attention)" : ""}`, { size: 8, indent: 14, bold: !!a.concern });
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
