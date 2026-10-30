import { REPORT_DISCLAIMER, type ReportInput, type ReportSnapshot } from "./report";

const TD = "padding:6px;border:1px solid #e2e8f0";
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

export function buildReportHtml(snapshot: ReportSnapshot, input: ReportInput): string {
  // Deterministic — no AI calls, only saved facts + snapshot versions
  const esc = escapeHtml;
  const rows = input.checklist
    .map((r) => `<tr><td style="${TD}">${esc(r.title)}</td><td style="${TD}"><span style="background:#f1f5f9;padding:2px 8px;border-radius:999px;font-size:12px">${esc(r.status)}</span></td><td style="${TD};font-size:12px">${esc(r.notes ?? "")}</td></tr>`)
    .join("");
  const mats =
    (input.materials ?? [])
      .map((m) => `<tr><td style="${TD}">${esc(m.description)}</td><td style="${TD}">${safeNumber(m.quantity)} ${esc(m.unit)} ${m.provisional ? '<span style="background:#fef3c7;padding:1px 6px;border-radius:999px;font-size:11px">provisional</span>' : ""}</td><td style="${TD};font-size:12px">${esc(m.rationale)}</td></tr>`)
      .join("") || `<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b">No materials — report without materials list</td></tr>`;
  const quote = input.quotation
    ? `<p><strong>Supplier:</strong> ${esc(input.quotation.supplier)} — <strong>Total:</strong> ${safeNumber(input.quotation.total)} ${esc(input.quotation.currency)} (from supplied quotation, not invented)</p>`
    : "<p style='color:#64748b'>No quotation attached — prices not invented.</p>";
  const lims = input.limitations.length ? `<ul>${input.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "<p>None stated.</p>";
  const findings =
    input.findings
      .map((f) => {
        const confirmed = (f.status ?? "confirmed") === "confirmed";
        return `<li><strong>${esc(f.title)}</strong>${f.severity ? ` — <em>${esc(f.severity)}</em>` : ""}${confirmed ? "" : ' <span style="background:#fef3c7;padding:1px 6px;border-radius:999px;font-size:11px">unconfirmed</span>'}${f.description ? `<div>${esc(f.description)}</div>` : ""}${f.uncertainty ? `<div style="font-size:12px;color:#92400e">Uncertainty: ${esc(f.uncertainty)}</div>` : ""}<div class="meta">Evidence linked: ${f.evidenceCount === undefined ? "—" : safeNumber(f.evidenceCount)}</div></li>`;
      })
      .join("") || "<li style='color:#64748b'>No confirmed findings recorded</li>";
  const measurements =
    input.measurements.map((m) => `<tr><td style="${TD}">${esc(m.name)}</td><td style="${TD}">${safeNumber(m.value)} ${esc(m.unit)}</td></tr>`).join("") ||
    `<tr><td colspan="2" style="padding:12px;text-align:center;color:#64748b">No measurements recorded</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>EvalAI Report ${esc(snapshot.id)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#0f172a;font-size:14px;line-height:1.5} h1{font-size:20px;margin:0} h2{font-size:15px;margin:16px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px} table{width:100%;border-collapse:collapse;margin:8px 0} .meta{color:#64748b;font-size:12px}</style>
</head><body>
<header style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">EvalAI — ${esc(input.mode)} report · ${esc(input.pack)}</div>
<h1>${esc(input.siteName)}</h1>
<div class="meta">Snapshot ${esc(snapshot.id)} · Assessment v${safeNumber(snapshot.assessmentVersion)} · Checklist ${esc(snapshot.checklistVersion)}${snapshot.materialsVersion ? ` · Materials v${safeNumber(snapshot.materialsVersion)}` : ""}${snapshot.quotationVersion ? ` · Quotation v${safeNumber(snapshot.quotationVersion)}` : ""} · ${snapshot.finalized ? "Finalized (immutable)" : "Draft"} · ${esc(snapshot.createdAt)}</div>
</header>
<section><h2>Scope & context</h2><p>${esc(String(input.context.goal ?? input.context.scope ?? "—"))}</p></section>
<section><h2>Checklist outcomes</h2><table><thead><tr><th style="text-align:left;${TH}">Item</th><th style="${TH}">Status</th><th style="${TH}">Notes</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:12px;color:#64748b">Not Checked ≠ Pass. Pass requires actual check + supporting evidence.</p></section>
<section><h2>Measurements</h2><table><thead><tr><th style="${TH}">Name</th><th style="${TH}">Value</th></tr></thead><tbody>${measurements}</tbody></table></section>
<section><h2>Findings</h2><ul>${findings}</ul></section>
<section><h2>Materials schedule — traceable</h2><table><thead><tr><th style="${TH}">Description</th><th style="${TH}">Qty</th><th style="${TH}">Rationale (source)</th></tr></thead><tbody>${mats}</tbody></table>${quote}</section>
<section><h2>Completeness, limitations & uncertainty</h2>${lims}</section>
<section><h2>Important notice</h2><p class="meta">${esc(REPORT_DISCLAIMER)}</p></section>
<footer style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px" class="meta">Generated from versioned snapshot — later edits create new versions, never mutate finalized reports. Evidence via private storage signed URLs only after authorization.</footer>
</body></html>`;
}
