"use client";
import { FINDING_PRIORITIES, KEY_FINDING_LIMITS, PRIORITY_LABEL, type ReportKeyFinding } from "@eval-ai/shared";

/** Sources shown on a card, in plain words. Photos are shown by their number in the report. */
function sourceLabel(b: ReportKeyFinding["basis"][number], photoNumber: Map<string, number>): string {
  if (b.kind === "photo") return photoNumber.has(b.ref) ? `Photo ${photoNumber.get(b.ref)}` : "";
  return (b.kind === "item" ? "Checklist: " : b.kind === "measurement" ? "Measurement: " : "Finding: ") + b.ref;
}

/**
 * Edit the report's key findings: each card is one technical finding with what was observed, what it means and what to do. The AI drafts
 * them; the person corrects the wording, changes the priority, removes what doesn't hold up, adds their own, and ticks "confirmed" once
 * they have checked a finding against the evidence.
 */
export function KeyFindingsEditor({ value, onChange, photoNumber }: { value: ReportKeyFinding[]; onChange: (next: ReportKeyFinding[]) => void; photoNumber: Map<string, number> }): JSX.Element {
  const L = KEY_FINDING_LIMITS;
  const patch = (i: number, p: Partial<ReportKeyFinding>) => onChange(value.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const add = () => onChange([...value, { id: `p${Date.now()}`, title: "", priority: "medium", observed: "", meaning: "", action: "", basis: [], source: "person" }]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Key findings</div>
        <button type="button" onClick={add} disabled={value.length >= L.max} className="btn-secondary text-xs">Add a finding</button>
      </div>
      <p className="text-xs text-slate-500">Related observations, measurements and photos combined into one finding each. &ldquo;What it means&rdquo; is interpretation and may use general technical knowledge: check it, and tick <em>confirmed</em> when you have.</p>
      {value.length === 0 ? <p className="rounded border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">No written findings yet. The report lists the confirmed findings and the items marked Issue or Needs attention until you add or draft some.</p> : null}
      {value.map((f, i) => {
        const sources = f.basis.map((b) => sourceLabel(b, photoNumber)).filter(Boolean);
        return (
          <div key={f.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={`Finding ${i + 1} title`} value={f.title} onChange={(e) => patch(i, { title: e.target.value })} maxLength={L.title} placeholder="Short title for this finding" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium" />
              <select aria-label={`Finding ${i + 1} priority`} value={f.priority} onChange={(e) => patch(i, { priority: e.target.value as ReportKeyFinding["priority"] })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                {FINDING_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            <label className="block text-xs font-medium text-slate-700">Observed
              <textarea value={f.observed} onChange={(e) => patch(i, { observed: e.target.value })} maxLength={L.observed} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            <label className="block text-xs font-medium text-slate-700">What it means <span className="font-normal text-slate-500">(interpretation)</span>
              <textarea value={f.meaning} onChange={(e) => patch(i, { meaning: e.target.value })} maxLength={L.meaning} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            <label className="block text-xs font-medium text-slate-700">Recommended action
              <textarea value={f.action} onChange={(e) => patch(i, { action: e.target.value })} maxLength={L.action} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
            </label>
            {sources.length ? <p className="text-xs text-slate-500">Based on: {sources.join(" · ")}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!f.confirmed} onChange={(e) => patch(i, { confirmed: e.target.checked })} /> I have checked this finding against the evidence{f.source === "ai" && !f.confirmed ? <span className="text-amber-700">(AI draft)</span> : null}</label>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="btn-secondary text-xs text-red-600">Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
