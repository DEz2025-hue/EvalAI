"use client";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_TEMPLATE, SECTION_LABEL, TEMPLATE_LIMITS, buildReportHtml, normalizeTemplate, type ReportInput, type ReportSnapshot, type ReportTemplate } from "@eval-ai/shared";

// Largest logo file taken from the picker. The saved style is limited to about 300 KB of text, which is roughly a 220 KB picture.
const MAX_LOGO_BYTES = 200_000;

// A made-up report, so the office can see its style without opening a job.
const SAMPLE_SNAPSHOT: ReportSnapshot = { id: "sample", assessmentId: "sample", assessmentVersion: 1, checklistVersion: "v1", createdAt: new Date().toISOString(), createdBy: "sample", finalized: false, immutable: true };
const SAMPLE: ReportInput = {
  siteName: "Sample site (preview only)",
  mode: "assessment",
  pack: "solar",
  context: { goal: "Quote a rooftop array", scenario: "new_install" },
  checklist: [
    { title: "Roof / structure / mounting constraints", status: "pass", notes: "Corrugated iron, good condition", category: "Site", required: true, evidenceCount: 2 },
    { title: "Orientation, tilt, shading survey", status: "needs_attention", notes: "Large tree on the north-west side", category: "Site", required: true, evidenceCount: 1 },
    { title: "Load audit", status: "not_checked", category: "Customer", required: true },
  ],
  siteBrief: { goal: "Quote a rooftop array", address: "1 Example Road" },
  findings: [],
  measurements: [{ name: "Roof area", value: 42.5, unit: "m²" }],
  materials: [{ description: "Solar modules", quantity: 12, unit: "pcs", rationale: "Example only", provisional: true }],
  limitations: ["Load audit not checked yet"],
  narrative: {
    summary: "This is sample text so you can see how your style looks. A real report is written from the saved record of a job.",
    siteOverview: "A school hall with a corrugated iron roof.",
    openItems: "The load audit is still to do.",
    keyFindings: [{ id: "f1", title: "Afternoon shading from a tree", priority: "medium", observed: "A tree on the north-west side shades the roof.", meaning: "Shade can lower the output of a whole string.", action: "Have the shading assessed.", basis: [{ kind: "item", ref: "Orientation, tilt, shading survey" }], source: "ai" }],
  },
};

/** The office's report style (D-031): name, logo, colour, header and footer text, and which sections appear, in what order, under what heading. */
export default function ReportStyleCard(): JSX.Element {
  const [tpl, setTpl] = useState<ReportTemplate>(DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState<ReportTemplate | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/report-template");
        const data = (await res.json().catch(() => ({}))) as { template?: ReportTemplate; isDefault?: boolean; canEdit?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load the report style");
        const t = normalizeTemplate(data.template);
        setTpl(t);
        setSaved(t);
        setIsDefault(!!data.isDefault);
        setCanEdit(!!data.canEdit);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = useMemo(() => JSON.stringify(normalizeTemplate(tpl)) !== JSON.stringify(saved), [tpl, saved]);
  const preview = useMemo(() => (showPreview ? buildReportHtml(SAMPLE_SNAPSHOT, { ...SAMPLE, template: normalizeTemplate(tpl) }) : ""), [showPreview, tpl]);

  const set = (patch: Partial<ReportTemplate>) => setTpl((t) => ({ ...t, ...patch }));
  const setSection = (i: number, patch: Partial<ReportTemplate["sections"][number]>) => setTpl((t) => ({ ...t, sections: t.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, dir: -1 | 1) =>
    setTpl((t) => {
      const j = i + dir;
      if (j < 0 || j >= t.sections.length) return t;
      const a = [...t.sections];
      [a[i], a[j]] = [a[j], a[i]];
      return { ...t, sections: a };
    });

  function pickLogo(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError("The logo must be a PNG or JPEG picture.");
    if (file.size > MAX_LOGO_BYTES) return setError(`That logo is ${Math.round(file.size / 1000)} KB. Use one under ${MAX_LOGO_BYTES / 1000} KB (a small picture is plenty).`);
    const reader = new FileReader();
    reader.onload = () => set({ logo: String(reader.result) });
    reader.onerror = () => setError("The logo could not be read.");
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/report-template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalizeTemplate(tpl)) });
      const data = (await res.json().catch(() => ({}))) as { template?: ReportTemplate; note?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the report style");
      const t = normalizeTemplate(data.template);
      setTpl(t);
      setSaved(t);
      setIsDefault(false);
      setMsg(data.note ?? "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("Go back to the built-in report style? Drafts already made keep the style they have, and finalized reports never change.")) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/report-template", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not reset the report style");
      setTpl(DEFAULT_TEMPLATE);
      setSaved(normalizeTemplate(DEFAULT_TEMPLATE));
      setIsDefault(true);
      setMsg("Back to the built-in style.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50";
  return (
    <section aria-label="Report style" className="card p-5">
      <h2 className="text-sm font-semibold">Report style</h2>
      <p className="mt-1 text-xs text-slate-500">
        Make your reports look like your office&apos;s: name, logo, colour, header and footer text, and which sections appear, in what order and under what heading. It changes how a report looks, never what it says. The review status, sign-off and important notice always stay.
      </p>
      {loading ? <p className="mt-3 text-xs text-slate-500">Loading…</p> : null}
      {!loading && !canEdit ? <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">Only an owner or admin can change the report style. {isDefault ? "This workspace uses the built-in style." : "This workspace has its own style."}</p> : null}
      {error ? <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {msg ? <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">{msg}</div> : null}

      {!loading ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">Office name
              <input className={input} value={tpl.officeName ?? ""} maxLength={TEMPLATE_LIMITS.name} disabled={!canEdit} onChange={(e) => set({ officeName: e.target.value })} placeholder="Shown at the top (default: EvalAI)" />
            </label>
            <label className="text-xs font-medium">Accent colour
              <span className="mt-1 flex items-center gap-2">
                <input type="color" value={tpl.accentColor ?? "#0f172a"} disabled={!canEdit} onChange={(e) => set({ accentColor: e.target.value })} aria-label="Accent colour" className="h-8 w-12 rounded border border-slate-200" />
                <span className="text-slate-500">{tpl.accentColor ?? "built-in"}</span>
                {tpl.accentColor && canEdit ? <button type="button" className="underline text-slate-600" onClick={() => set({ accentColor: undefined })}>use built-in</button> : null}
              </span>
            </label>
            <label className="text-xs font-medium sm:col-span-2">Header text
              <input className={input} value={tpl.headerText ?? ""} maxLength={TEMPLATE_LIMITS.headerText} disabled={!canEdit} onChange={(e) => set({ headerText: e.target.value })} placeholder="For example a licence number or a tagline" />
            </label>
            <label className="text-xs font-medium sm:col-span-2">Footer text
              <input className={input} value={tpl.footerText ?? ""} maxLength={TEMPLATE_LIMITS.footerText} disabled={!canEdit} onChange={(e) => set({ footerText: e.target.value })} placeholder="For example the office address and phone" />
            </label>
          </div>

          <div>
            <div className="text-xs font-medium">Logo <span className="font-normal text-slate-500">(PNG or JPEG, under {MAX_LOGO_BYTES / 1000} KB)</span></div>
            <div className="mt-1 flex items-center gap-3">
              {tpl.logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={tpl.logo} alt="Logo preview" className="max-h-12 max-w-[160px] rounded border border-slate-200 bg-white p-1" /> : <span className="text-xs text-slate-500">No logo</span>}
              {canEdit ? <input type="file" accept="image/png,image/jpeg" onChange={(e) => pickLogo(e.target.files?.[0])} className="text-xs" aria-label="Choose a logo" /> : null}
              {tpl.logo && canEdit ? <button type="button" className="text-xs underline text-slate-600" onClick={() => set({ logo: undefined })}>Remove logo</button> : null}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium">Sections <span className="font-normal text-slate-500">(order, show or hide, your own heading)</span></div>
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {tpl.sections.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={s.visible} disabled={!canEdit} onChange={(e) => setSection(i, { visible: e.target.checked })} aria-label={`Show ${SECTION_LABEL[s.id]}`} />
                    <span className="w-52 font-medium">{SECTION_LABEL[s.id]}</span>
                  </label>
                  <input className="min-w-[10rem] flex-1 rounded border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50" value={s.title ?? ""} maxLength={TEMPLATE_LIMITS.title} disabled={!canEdit || !s.visible} placeholder="Your heading (optional)" onChange={(e) => setSection(i, { title: e.target.value })} aria-label={`Heading for ${SECTION_LABEL[s.id]}`} />
                  {canEdit ? (
                    <span className="flex gap-1">
                      <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${SECTION_LABEL[s.id]} up`}>↑</button>
                      <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={i === tpl.sections.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${SECTION_LABEL[s.id]} down`}>↓</button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">The reviewer notes, review status or sign-off, and the important notice are always printed at the end.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide preview" : "Preview with sample text"}</button>
            {canEdit ? <button type="button" className="btn-primary text-xs" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save style"}</button> : null}
            {canEdit && !isDefault ? <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={reset}>Use the built-in style</button> : null}
          </div>
          {canEdit ? <p className="text-xs text-slate-500">New report drafts use the saved style. A draft you already made keeps its style until you press &ldquo;Re-apply office style&rdquo; on the report page, and a finalized report never changes.</p> : null}

          {showPreview ? <iframe title="Report style preview" sandbox="" srcDoc={preview} className="h-[28rem] w-full rounded-lg border border-slate-200 bg-white" /> : null}
        </div>
      ) : null}
    </section>
  );
}
