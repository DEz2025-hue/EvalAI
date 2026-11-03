import { REPORT_DISCLAIMER, type ReportChecklistRow, type ReportInput, type ReportKeyFinding, type ReportPhoto, type ReportSnapshot } from "./report";
import { statusLabel } from "./checklist";
import { PRIORITY_LABEL, checklistGlance, glanceSentence, groupByCategory, keyFindingsFor, photoNumbers, recommendedActions, reportLayout, siteBriefLines } from "./reportOverview";
import { scenarioFor, scenarioLabel } from "./scenario";
import { DEFAULT_ACCENT, resolveTemplate, type SectionId } from "./reportTemplate";

/** " · New installation" / " · Existing system", or nothing when the job has no situation (older jobs). */
function situationSuffix(input: ReportInput): string {
  const s = scenarioFor(input.mode, input.context?.scenario);
  return s ? " · " + scenarioLabel(s) : "";
}

/** Only a JPEG data URI of base64 characters may become an image source; anything else is dropped (the payload is untrusted). */
export function safeImageSrc(src: unknown): string {
  return typeof src === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(src) ? src : "";
}

const TD = "padding:6px;border:1px solid #e2e8f0;vertical-align:top";
const TH = "padding:6px;border:1px solid #e2e8f0;background:#f8fafc";

/** Escape text for HTML text AND attribute contexts. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Numbers are coerced so a tampered payload can never inject markup through a numeric field. */
export function safeNumber(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : "—";
}

const PILL: Record<string, string> = {
  pass: "background:#dcfce7;color:#166534",
  fail: "background:#fee2e2;color:#991b1b",
  needs_attention: "background:#fef3c7;color:#92400e",
  not_applicable: "background:#e0f2fe;color:#075985",
  not_checked: "background:#f1f5f9;color:#475569",
};

function pill(status: string): string {
  return `<span style="${PILL[status] ?? PILL.not_checked};padding:2px 8px;border-radius:999px;font-size:12px;white-space:nowrap">${escapeHtml(statusLabel(status))}</span>`;
}

const PRIORITY_STYLE: Record<string, { pill: string; bar: string }> = {
  high: { pill: "background:#fee2e2;color:#991b1b", bar: "#dc2626" },
  medium: { pill: "background:#fef3c7;color:#92400e", bar: "#d97706" },
  low: { pill: "background:#e0f2fe;color:#075985", bar: "#0284c7" },
  info: { pill: "background:#f1f5f9;color:#475569", bar: "#94a3b8" },
};

function measuredText(r: ReportChecklistRow): string {
  return r.measured && Number.isFinite(Number(r.measured.value)) ? `Measured: ${safeNumber(r.measured.value)} ${escapeHtml(r.measured.unit)}` : "";
}

const AI_TAG = '<span style="background:#fef3c7;padding:1px 6px;border-radius:999px;font-size:11px">AI description, not verified</span>';

/** A photo with the AI's description of it. Always labelled as not verified (D-022). */
function photoFigure(p: ReportPhoto, n: number, small = false): string {
  const esc = escapeHtml;
  const src = safeImageSrc(p.thumbnail);
  const w = small ? "max-width:200px;max-height:150px" : "max-width:260px;max-height:200px";
  return `<figure style="margin:8px 0;padding:8px;border:1px solid #e2e8f0;border-radius:6px"><figcaption><strong>Photo ${n}</strong>${p.itemTitle ? ` — ${esc(p.itemTitle)}` : ""}</figcaption>${src ? `<img src="${src}" alt="${esc(p.caption || "Photo " + n)}" style="${w};margin:6px 0;display:block">` : ""}<div>${esc(p.caption)} ${AI_TAG}</div>${p.observations.length ? `<ul>${p.observations.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}${p.cannotTell.length ? `<div class="meta">Cannot be told from this photo: ${p.cannotTell.map((c) => esc(c)).join("; ")}</div>` : ""}</figure>`;
}

/** One key finding: what was observed, what it means (interpretation) and what to do, with its sources and the photos it cites. */
function findingCard(f: ReportKeyFinding, n: number, input: ReportInput, numbers: Map<string, number>): string {
  const esc = escapeHtml;
  const style = PRIORITY_STYLE[f.priority] ?? PRIORITY_STYLE.info;
  const photos = (input.photos ?? []).filter((p) => f.basis.some((b) => b.kind === "photo" && b.ref === p.evidenceId));
  const sources = f.basis
    .map((b) => (b.kind === "photo" ? (numbers.has(b.ref) ? `Photo ${numbers.get(b.ref)}` : "") : b.kind === "item" ? `Checklist: ${b.ref}` : b.kind === "measurement" ? `Measurement: ${b.ref}` : `Finding: ${b.ref}`))
    .filter(Boolean);
  const status = f.confirmed ? "Confirmed by the reviewer" : f.source === "ai" ? "AI draft — not yet confirmed" : "";
  return `<div style="border:1px solid #e2e8f0;border-left:4px solid ${style.bar};border-radius:6px;padding:10px 12px;margin:10px 0">
<div><strong>${n}. ${esc(f.title)}</strong> <span style="${style.pill};padding:2px 8px;border-radius:999px;font-size:12px;white-space:nowrap">${esc(PRIORITY_LABEL[f.priority] ?? "")}</span>${status ? ` <span class="meta">${esc(status)}</span>` : ""}</div>
${f.observed.trim() ? `<p style="margin:6px 0;white-space:pre-wrap"><strong>Observed.</strong> ${esc(f.observed)}</p>` : ""}
${f.meaning.trim() ? `<p style="margin:6px 0;white-space:pre-wrap"><strong>What it means</strong> <span class="meta">(interpretation, including general technical knowledge)</span><strong>.</strong> ${esc(f.meaning)}</p>` : ""}
${f.action.trim() ? `<p style="margin:6px 0;white-space:pre-wrap"><strong>Recommended action.</strong> ${esc(f.action)}</p>` : ""}
${sources.length ? `<div class="meta">Based on: ${sources.map((s) => esc(s)).join(" · ")}</div>` : ""}
${f.evidenceCount === undefined ? "" : `<div class="meta">Evidence linked: ${safeNumber(f.evidenceCount)}</div>`}
${photos.map((p) => photoFigure(p, numbers.get(p.evidenceId) ?? 0, true)).join("")}
</div>`;
}

export function buildReportHtml(snapshot: ReportSnapshot, input: ReportInput): string {
  // Deterministic — no AI calls, only saved facts + snapshot versions
  const esc = escapeHtml;
  const para = (t?: string) => (t && t.trim() ? `<p style="white-space:pre-wrap">${esc(t)}</p>` : "");
  const narrative = input.narrative ?? {};
  const has = (t?: string) => !!(t && t.trim());
  const checklist = input.checklist ?? [];
  const glance = checklistGlance(checklist);
  const layout = reportLayout(input);
  const numbers = photoNumbers(input);
  const photos = input.photos ?? [];
  // The office's report style (D-031). With no template this is today's report: same order, same headings, same colours.
  const tpl = resolveTemplate(input.template);
  // A heading the template renamed is escaped; the built-in headings are trusted literals.
  const H = (id: SectionId, fallback: string) => {
    const own = tpl.custom(id);
    return own ? esc(own) : fallback;
  };

  // ---- At a glance (counted from the saved checklist) ----
  const openItems = glance.requiredOpen.map((r) => `<li>${esc(r.title)}</li>`).join("");
  const glanceSection = `<section><h2>Report at a glance</h2><p>${esc(glanceSentence(glance))}</p>${
    glance.requiredOpen.length ? `<p class="meta" style="margin-bottom:2px">Required items still Not Checked:</p><ul>${openItems}</ul>` : ""
  }</section>`;
  const glanceLine = `<p class="meta" style="margin-top:-4px">At a glance: ${esc(glanceSentence(glance))}</p>`;

  // ---- Site and scope ----
  const lines = siteBriefLines(input.siteBrief, input.context?.goal ?? input.context?.scope);
  const briefHtml = lines.map((l) => `<tr><td style="${TD};width:34%;font-weight:600">${esc(l.label)}</td><td style="${TD};white-space:pre-wrap">${esc(l.value)}</td></tr>`).join("");
  const answered = (input.siteBrief?.answers ?? []).filter((a) => a.answer?.trim());
  const answersHtml = answered.length
    ? `<h3 style="font-size:13px;margin:12px 0 4px">Scope questions</h3><table><tbody>${answered.map((a) => `<tr><td style="${TD};width:50%">${esc(a.question)}</td><td style="${TD};white-space:pre-wrap">${esc(a.answer)}</td></tr>`).join("")}</tbody></table>`
    : "";
  const iv = input.siteBrief?.interview;
  const interviewHtml =
    iv && (iv.details.length > 0 || iv.statements.length > 0)
      ? `<p class="meta">What the person said when asked about the job. These are statements, not verified facts.</p>${iv.details.length ? `<table><tbody>${iv.details.map((d) => `<tr><td style="${TD};width:34%;font-weight:600">${esc(d.label)}</td><td style="${TD};white-space:pre-wrap">${esc(d.value)}</td></tr>`).join("")}</tbody></table>` : ""}${iv.statements.length ? `<table><tbody>${iv.statements.map((s) => `<tr><td style="${TD};width:50%">${esc(s.question)}</td><td style="${TD};white-space:pre-wrap">${esc(s.answer)}</td></tr>`).join("")}</tbody></table>` : ""}${iv.openQuestions.length ? `<p class="meta">Left open in the interview: ${esc(iv.openQuestions.join("; "))}</p>` : ""}`
      : "";
  const scopeSection = `<section><h2>${H("siteScope", "Site and scope")}</h2>${para(narrative.siteOverview)}${briefHtml ? `<table><tbody>${briefHtml}</tbody></table>` : has(narrative.siteOverview) ? "" : "<p>—</p>"}${answersHtml}</section>`;
  const interviewSection = interviewHtml ? `<section><h2>${H("interview", "Site interview")}</h2>${interviewHtml}</section>` : "";

  // ---- Confirmed findings table (older reports) ----
  const flaggedItems = glance.flagged.map((r) => `<li><strong>${esc(r.title)}</strong> ${pill(r.status)}${r.notes ? `<div style="font-size:13px">${esc(r.notes)}</div>` : ""}${measuredText(r) ? `<div class="meta">${measuredText(r)}</div>` : ""}</li>`).join("");
  const confirmedList =
    input.findings
      .map((f) => {
        const confirmed = (f.status ?? "confirmed") === "confirmed";
        return `<li><strong>${esc(f.title)}</strong>${f.severity ? ` — <em>${esc(f.severity)}</em>` : ""}${confirmed ? "" : ' <span style="background:#fef3c7;padding:1px 6px;border-radius:999px;font-size:11px">unconfirmed</span>'}${f.description ? `<div>${esc(f.description)}</div>` : ""}${f.uncertainty ? `<div style="font-size:12px;color:#92400e">Uncertainty: ${esc(f.uncertainty)}</div>` : ""}<div class="meta">Evidence linked: ${f.evidenceCount === undefined ? "—" : safeNumber(f.evidenceCount)}</div></li>`;
      })
      .join("") || "<li style='color:#64748b'>No confirmed findings recorded</li>";

  // ---- Photos ----
  const confLabel = (c: string) => (c === "high" ? "likely" : c === "medium" ? "possible" : "unclear");
  const cited = new Set(layout === "findings" ? keyFindingsFor(input).flatMap((f) => f.basis.filter((b) => b.kind === "photo").map((b) => b.ref)) : []);
  const shown = photos.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => !cited.has(p.evidenceId));
  const photoSection = shown.length
    ? `<section><h2>${H("photos", layout === "findings" && cited.size ? "Other photos" : "Photos and what was seen")}</h2><p class="meta">Descriptions below were written by an AI from the photo and have not been verified by a person. They are not findings or measurements.</p>${shown.map(({ p, n }) => photoFigure(p, n)).join("")}</section>`
    : "";
  const issueItems = shown.flatMap(({ p, n }) => p.possibleIssues.map((x) => `<li>${esc(x.text)} <span class="meta">(Photo ${n}, ${confLabel(x.confidence)})</span></li>`));
  const issueSection = issueItems.length
    ? `<section><h2>Possible issues seen in photos (AI, not verified)</h2><p class="meta">These are things an AI noticed that a person should check. They are not confirmed findings and are not included in the findings above.</p><ul>${issueItems.join("")}</ul></section>`
    : "";

  // ---- Materials ----
  const mats =
    (input.materials ?? [])
      .map((m) => `<tr><td style="${TD}">${esc(m.description)}${m.specification ? `<div style="font-size:12px;color:#475569">${esc(m.specification)}</div>` : ""}${m.source === "ai_suggested" ? ' <span style="background:#e0e7ff;padding:1px 6px;border-radius:999px;font-size:11px">AI suggestion</span>' : ""}</td><td style="${TD}">${m.quantityTbd ? "TBD" : `${safeNumber(m.quantity)} ${esc(m.unit)}`} ${m.provisional || m.quantityTbd ? '<span style="background:#fef3c7;padding:1px 6px;border-radius:999px;font-size:11px">provisional</span>' : ""}</td><td style="${TD};font-size:12px">${esc(m.rationale)}</td></tr>`)
      .join("") || `<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b">No materials — report without materials list</td></tr>`;
  const aiNote = (input.materials ?? []).some((m) => m.source === "ai_suggested" || m.quantityTbd)
    ? `<p class="meta">Items marked AI suggestion were proposed from the recorded measurements and general rules. Quantities marked provisional or TBD must be confirmed. This list is not a quotation and not a design.</p>`
    : "";
  const quote = input.quotation
    ? `<p><strong>Supplier:</strong> ${esc(input.quotation.supplier)} — <strong>Total:</strong> ${safeNumber(input.quotation.total)} ${esc(input.quotation.currency)} (from supplied quotation, not invented)</p>`
    : "<p style='color:#64748b'>No quotation attached — prices not invented.</p>";
  const materialsSection = `<section><h2>${H("materials", "Materials schedule — traceable")}</h2><table><thead><tr><th style="text-align:left;${TH}">Description</th><th style="${TH}">Qty</th><th style="${TH}">Rationale (source)</th></tr></thead><tbody>${mats}</tbody></table>${aiNote}${quote}</section>`;

  // ---- Limitations ----
  const lims = input.limitations.length ? `<ul>${input.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "<p>None stated.</p>";

  // ---- Appendix: every checklist result, grouped by area ----
  const appendixRows = groupByCategory(checklist)
    .map(
      (g) =>
        `<tr><td colspan="4" style="${TH};font-weight:600">${esc(g.category)}</td></tr>` +
        g.rows
          .map(
            (r) =>
              `<tr><td style="${TD}">${esc(r.title)}${r.required ? ' <span class="meta">(required)</span>' : ""}</td><td style="${TD}">${pill(r.status)}</td><td style="${TD};font-size:12px">${esc(r.notes ?? "")}${measuredText(r) ? `<div class="meta">${measuredText(r)}</div>` : ""}</td><td style="${TD};font-size:12px;text-align:center">${r.evidenceCount === undefined ? "—" : safeNumber(r.evidenceCount)}</td></tr>`,
          )
          .join(""),
    )
    .join("");
  const measurements =
    input.measurements.map((m) => `<tr><td style="${TD}">${esc(m.name)}</td><td style="${TD}">${safeNumber(m.value)} ${esc(m.unit)}</td></tr>`).join("") ||
    `<tr><td colspan="2" style="padding:12px;text-align:center;color:#64748b">No measurements recorded</td></tr>`;

  /** `title` is already safe HTML (a literal, or an escaped template heading). */
  const narrativeSection = (title: string, text?: string) => (has(text) ? `<section><h2>${title}</h2>${para(text)}</section>` : "");
  const signOff = snapshot.finalized && snapshot.reviewedAt
    ? `<section><h2>Review and sign-off</h2><p>Reviewed and signed off by <strong>${esc(snapshot.reviewedByLabel ?? "a workspace member")}</strong> on ${esc(snapshot.reviewedAt)}.${snapshot.reviewNote ? ` Note: ${esc(snapshot.reviewNote)}` : ""}</p></section>`
    : `<section><h2>Review status</h2><p class="meta">${snapshot.finalized ? "Finalized." : "DRAFT — not yet reviewed or signed off. Do not rely on this document."}</p></section>`;

  // ---- The body: every section is a named piece, so the template can order, hide and rename them ----
  const openItemsSection = `<section><h2>${H("openItems", "Open items, limitations & uncertainty")}</h2>${para(narrative.openItems)}${lims}</section>`;
  const parts: Record<SectionId, string> = {
    summary: "",
    siteScope: scopeSection,
    interview: interviewSection,
    keyFindings: "",
    actions: "",
    photos: photoSection + "\n" + issueSection,
    materials: materialsSection,
    openItems: openItemsSection,
    appendixChecklist: `<section><h2>${H("appendixChecklist", "Appendix A — Checklist results")}</h2><table><thead><tr><th style="text-align:left;${TH}">Item</th><th style="${TH}">Result</th><th style="${TH}">Notes</th><th style="${TH}">Photos</th></tr></thead><tbody>${appendixRows || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b">No checklist items recorded</td></tr>`}</tbody></table><p style="font-size:12px;color:#64748b">Not Checked ≠ Pass. Pass requires actual check + supporting evidence.</p></section>`,
    appendixMeasurements: `<section><h2>${H("appendixMeasurements", "Appendix B — Measurements")}</h2><table><thead><tr><th style="text-align:left;${TH}">Name</th><th style="${TH}">Value</th></tr></thead><tbody>${measurements}</tbody></table></section>`,
  };
  if (layout === "findings") {
    const findings = keyFindingsFor(input);
    const actions = recommendedActions(findings);
    parts.summary = `${narrativeSection(H("summary", "Executive summary"), narrative.summary)}${glanceLine}`;
    parts.keyFindings = `<section><h2>${H("keyFindings", "Key findings")}</h2>${
      findings.length
        ? findings.map((f, i) => findingCard(f, i + 1, input, numbers)).join("")
        : "<p style='color:#64748b'>No findings, issues or items needing attention were recorded.</p>"
    }</section>`;
    const actionsSection = actions.length
      ? `<section><h2>${H("actions", "Recommended actions")}</h2><table><thead><tr><th style="${TH};width:16%">Priority</th><th style="text-align:left;${TH}">Action</th></tr></thead><tbody>${actions
          .map((a) => `<tr><td style="${TD}"><span style="${(PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.info).pill};padding:2px 8px;border-radius:999px;font-size:12px;white-space:nowrap">${esc(PRIORITY_LABEL[a.priority])}</span></td><td style="${TD}"><strong>${esc(a.title)}.</strong> ${esc(a.action)}</td></tr>`)
          .join("")}</tbody></table></section>`
      : "";
    parts.actions = actionsSection + "\n" + narrativeSection("Additional recommendations", narrative.recommendations);
  } else {
    const grouped = groupByCategory(checklist.filter((r) => r.status !== "not_checked"));
    const byAreaFallback = grouped.length
      ? grouped.map((g) => `<h3 style="font-size:13px;margin:10px 0 4px">${esc(g.category)}</h3><ul>${g.rows.map((r) => `<li>${esc(r.title)} ${pill(r.status)}${r.notes ? ` — ${esc(r.notes)}` : ""}</li>`).join("")}</ul>`).join("")
      : "<p class=\"meta\">Nothing has been checked yet.</p>";
    parts.summary = `${narrativeSection(H("summary", "Executive summary"), narrative.summary)}\n${glanceSection}`;
    parts.keyFindings = `<section><h2>${H("keyFindings", "What was found, by area")}</h2>${has(narrative.observations) ? para(narrative.observations) : byAreaFallback}</section>
<section><h2>Issues and risks</h2>${para(narrative.issues)}<h3 style="font-size:13px;margin:10px 0 4px">Findings</h3><ul>${confirmedList}</ul>${flaggedItems ? `<h3 style="font-size:13px;margin:10px 0 4px">Flagged during the checklist</h3><ul>${flaggedItems}</ul>` : ""}</section>`;
    parts.actions = narrativeSection(H("actions", "Recommended next steps"), narrative.recommendations);
  }
  const body = tpl.order.map((id) => parts[id]).filter((p) => p.trim()).join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>EvalAI Report ${esc(snapshot.id)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#0f172a;font-size:14px;line-height:1.5} h1{font-size:20px;margin:0} h2{font-size:15px;margin:16px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px} table{width:100%;border-collapse:collapse;margin:8px 0} .meta{color:#64748b;font-size:12px}${tpl.accentColor !== DEFAULT_ACCENT ? ` h1,h2{color:${tpl.accentColor}}` : ""}</style>
</head><body>
<header style="border-bottom:2px solid ${tpl.accentColor};padding-bottom:12px;margin-bottom:16px">
${tpl.logo ? `<img src="${esc(tpl.logo)}" alt="${esc(tpl.officeName ?? "Logo")}" style="max-height:56px;max-width:220px;display:block;margin-bottom:8px">\n` : ""}<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">${esc(tpl.officeName ?? "EvalAI")} — ${esc(input.mode)} report · ${esc(input.pack)}${esc(situationSuffix(input))}</div>
<h1>${esc(input.siteName)}</h1>
<div class="meta">Snapshot ${esc(snapshot.id)} · Assessment v${safeNumber(snapshot.assessmentVersion)} · Checklist ${esc(snapshot.checklistVersion)}${snapshot.materialsVersion ? ` · Materials v${safeNumber(snapshot.materialsVersion)}` : ""}${snapshot.quotationVersion ? ` · Quotation v${safeNumber(snapshot.quotationVersion)}` : ""} · ${snapshot.finalized ? "Finalized (immutable)" : "Draft"} · ${esc(snapshot.createdAt)}</div>
${tpl.headerText ? `<div class="meta" style="margin-top:4px">${esc(tpl.headerText)}</div>\n` : ""}</header>
${body}
${narrativeSection("Reviewer notes", narrative.notes)}
${signOff}
<section><h2>Important notice</h2><p class="meta">${esc(REPORT_DISCLAIMER)}</p></section>
<footer style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px" class="meta">${tpl.footerText ? `${esc(tpl.footerText)}<br>` : ""}Generated from versioned snapshot — later edits create new versions, never mutate finalized reports. Evidence via private storage signed URLs only after authorization.</footer>
</body></html>`;
}
