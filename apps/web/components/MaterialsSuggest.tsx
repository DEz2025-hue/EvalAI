"use client";
import { useState } from "react";
import { QUANTITY_TBD } from "@eval-ai/shared";

export type SuggestedItem = {
  id: string;
  description: string;
  specification?: string;
  quantity: number;
  unit: string;
  rationale: string;
  source: "ai_suggested";
  provisional: boolean;
  assumptions: string[];
};

type DraftItem = {
  group: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  rationale: string;
  provisional: boolean;
  assumptions: string[];
  quantityTbd: boolean;
  method: "rule" | "estimate" | "unknown";
};
type Draft = { designBasis: string; items: DraftItem[]; missingInputs: string[]; assumptions: string[]; duplicates: string[]; dropped: string[]; unverifiedFigures: string[]; label: string };
type Row = DraftItem & { keep: boolean; qtyText: string };

/**
 * "Suggest materials with AI" (D-029): the AI reads the whole job and proposes materials. Quantities for rule items are calculated by the
 * server; estimates and unknowns are marked. Nothing is saved here: the person keeps, edits or removes each item, adds them to the list,
 * and saves the list as a new version.
 */
export function MaterialsSuggest({ assessmentId, onAdd }: { assessmentId: string; onAdd: (items: SuggestedItem[]) => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId }) });
      const data = (await res.json().catch(() => ({}))) as Draft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The AI could not suggest materials");
      setDraft(data);
      setRows(data.items.map((i) => ({ ...i, keep: true, qtyText: i.quantityTbd ? "" : String(i.quantity) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  function add() {
    const picked = rows.filter((r) => r.keep).map((r, n): SuggestedItem => {
      const typed = Number(r.qtyText);
      const entered = r.qtyText.trim() !== "" && Number.isFinite(typed) && typed > 0;
      const stillTbd = r.quantityTbd && !entered;
      const quantity = stillTbd ? 1 : entered ? typed : r.quantity;
      const changed = entered && (r.quantityTbd || typed !== r.quantity);
      // A reviewer's own number replaces the TBD marker but the item stays provisional until it is confirmed on site.
      const assumptions = [...r.assumptions.filter((a) => !(entered && r.quantityTbd && a.startsWith(QUANTITY_TBD))), ...(changed ? ["Quantity entered by the reviewer"] : [])];
      return { id: `tmp-ai-${Date.now()}-${n}`, description: r.description, specification: r.specification || undefined, quantity, unit: r.unit, rationale: r.rationale, source: "ai_suggested", provisional: r.provisional || stillTbd || changed, assumptions };
    });
    onAdd(picked);
    setDraft(null);
    setRows([]);
  }

  const kept = rows.filter((r) => r.keep).length;
  return (
    <div className="space-y-3 rounded border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Suggest materials with AI</h3>
          <p className="text-xs text-slate-600">The AI reads the whole job and proposes materials. Quantities come from documented rules or are marked as estimates. Nothing is priced and nothing is saved until you add the items and save the list.</p>
        </div>
        <button type="button" onClick={run} disabled={busy} className="btn-primary text-xs">{busy ? "Analysing the job…" : draft ? "Run again" : "Suggest materials"}</button>
      </div>
      {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {draft ? (
        <div className="space-y-3">
          <div className="rounded bg-white p-3 text-xs">
            <div className="mb-1 font-semibold">Design basis (what the AI assumed)</div>
            <p className="whitespace-pre-wrap text-slate-700">{draft.designBasis || "—"}</p>
            {draft.missingInputs.length > 0 ? (
              <div className="mt-2">
                <div className="font-semibold">Add these and run again for firmer quantities</div>
                <ul className="list-disc pl-5 text-slate-700">{draft.missingInputs.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            ) : null}
            {draft.duplicates.length > 0 ? <p className="mt-2 text-slate-500">Left out because the list already has them: {draft.duplicates.join(", ")}.</p> : null}
            {draft.unverifiedFigures.length > 0 ? <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-amber-800">Check these figures in the text, they are not in the job record: {draft.unverifiedFigures.join(", ")}.</p> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="p-2 text-left">Add</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Qty</th><th className="p-2 text-left">Why and assumptions</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-100 align-top ${r.keep ? "" : "opacity-50"}`}>
                    <td className="p-2"><input type="checkbox" checked={r.keep} onChange={(e) => patch(i, { keep: e.target.checked })} aria-label={`Add ${r.description}`} /></td>
                    <td className="p-2">
                      <div className="text-xs text-slate-500">{r.group}</div>
                      <div className="font-medium">{r.description}</div>
                      <textarea value={r.specification} onChange={(e) => patch(i, { specification: e.target.value })} rows={2} className="mt-1 w-full rounded border border-slate-200 p-1 text-xs" aria-label={`Specification for ${r.description}`} />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <input value={r.qtyText} onChange={(e) => patch(i, { qtyText: e.target.value })} inputMode="decimal" placeholder="TBD" className="w-20 rounded border border-slate-200 p-1 text-sm" aria-label={`Quantity for ${r.description}`} />
                        <span className="text-xs text-slate-500">{r.unit}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{r.method === "rule" ? "Calculated from a rule" : r.method === "estimate" ? "AI estimate" : "Quantity unknown"}</div>
                    </td>
                    <td className="p-2 text-xs">
                      <p>{r.rationale}</p>
                      {r.assumptions.length > 0 ? <ul className="mt-1 list-disc pl-4 text-slate-600">{r.assumptions.map((a, k) => <li key={k}>{a}</li>)}</ul> : null}
                      {r.provisional || r.quantityTbd ? <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{r.quantityTbd ? "TBD" : "provisional"}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={add} disabled={kept === 0} className="btn-primary text-xs">Add {kept} item{kept === 1 ? "" : "s"} to the list</button>
            <button type="button" onClick={() => { setDraft(null); setRows([]); }} className="btn-secondary text-xs">Discard</button>
            <span className="text-xs text-slate-500">{draft.label}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
