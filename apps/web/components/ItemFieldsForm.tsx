"use client";
import { cleanAnswers, fieldsFor, type FieldSuggestion } from "@eval-ai/shared";

/** The simple answer fields of a checklist item (D-042): tap a choice to set it, tap it again to clear it, and type numbers. AI suggestions wait for a tap. */
export function ItemFieldsForm({ title, answers, onChange, suggestions = [], onDismiss }: { title: string; answers: unknown; onChange: (key: string, value: string | number | undefined) => void; suggestions?: FieldSuggestion[]; onDismiss?: (key: string) => void }): JSX.Element | null {
  const set = fieldsFor(title);
  if (!set) return null;
  const clean = cleanAnswers(title, answers);
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      {set.fields.map((f) => {
        const suggestion = suggestions.find((s) => s.key === f.key && clean[f.key] === undefined);
        const label = f.label + (f.required === false ? " (optional)" : "");
        return (
          <div key={f.key} className="space-y-1">
            {f.type === "choice" ? (
              <>
                <div className="text-sm font-medium">{label}</div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
                  {f.options.map((o) => {
                    const on = clean[f.key] === o;
                    const concern = on && f.concern?.includes(o);
                    return <button key={o} type="button" aria-pressed={on} onClick={() => onChange(f.key, on ? undefined : o)} className={`rounded-full border px-3 py-1 text-xs ${concern ? "border-amber-600 bg-amber-600 text-white" : on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>{o}</button>;
                  })}
                </div>
              </>
            ) : (
              <label className="block space-y-1">
                <span className="text-sm font-medium">{label}</span>
                <span className="flex items-center gap-2">
                  <input type="number" min="0" step="any" value={clean[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value === "" ? undefined : Number(e.target.value))} className="w-32 rounded border border-slate-200 px-3 py-1.5 text-sm" />
                  <span className="text-xs text-slate-500">{f.unit}</span>
                </span>
              </label>
            )}
            {suggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-900">
                <span>AI suggests: <strong>{suggestion.value}</strong>{suggestion.quote ? ` (from your note: “${suggestion.quote}”)` : ""}. Use it?</span>
                <button type="button" onClick={() => onChange(f.key, suggestion.value)} className="underline">Use</button>
                {onDismiss ? <button type="button" onClick={() => onDismiss(f.key)} className="underline">Dismiss</button> : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {set.photoRequired ? <p className="text-xs text-slate-500">A photo is required for this item before the report can be signed off.</p> : null}
    </div>
  );
}
