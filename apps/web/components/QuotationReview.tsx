"use client";
import { useState } from "react";

type QItem = { description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number };
type Quote = { id: string; supplier: string; date: string; currency: string; items: QItem[]; stale?: boolean; total?: number };

const lineTotal = (it: QItem): number => it.quantity * it.unitPrice + (it.taxesOrFees ?? 0);
const quoteTotal = (q: Quote): number => q.total ?? q.items.reduce((s, it) => s + lineTotal(it), 0);

export function QuotationReview({ assessmentId, materialsVersion = 1 }: { assessmentId: string; materialsVersion?: number }): JSX.Element {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [supplier, setSupplier] = useState("");
  const [provenance, setProvenance] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [lines, setLines] = useState<QItem[]>([{ description: "", quantity: 1, unit: "pc", unitPrice: 0, currency: "AUD" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadPersisted() {
    try {
      const res = await fetch(`/api/quotations?assessmentId=${assessmentId}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if ((data as { items?: Quote[] }).items?.length) setQuotes((data as { items: Quote[] }).items);
    } catch {}
  }
  if (typeof window !== "undefined" && quotes.length === 0) { loadPersisted(); }

  function setLine(i: number, patch: Partial<QItem>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch, currency } : l)));
  }

  async function addQuotation() {
    setError(null);
    if (!supplier.trim()) { setError("Supplier required — enter the supplier name from the quotation document."); return; }
    if (!provenance.trim()) { setError("Provenance required — quote must be traceable to a supplied document, not fabricated."); return; }
    const valid = lines.map((l) => ({ ...l, description: l.description.trim() })).filter((l) => l.description.length > 0);
    if (valid.length === 0) { setError("Add at least one line item with a description from the supplier document."); return; }
    for (const l of valid) {
      if (!(l.quantity > 0) || l.unitPrice < 0 || !l.unit.trim()) { setError("Each line needs a positive quantity, a unit, and a non-negative price."); return; }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, materialsVersion, supplier: supplier.trim(), currency, items: valid, date: new Date().toISOString().slice(0, 10), reference: provenance.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      const saved = (data as { id?: string; total?: number });
      setQuotes((prev) => [...prev, { id: saved.id ?? `q-${Date.now()}`, supplier: supplier.trim(), date: new Date().toISOString().slice(0, 10), currency, items: valid, stale: false, total: saved.total }]);
      setSupplier("");
      setProvenance("");
      setLines([{ description: "", quantity: 1, unit: "pc", unitPrice: 0, currency }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const current = quotes.filter((q) => !q.stale);
  const best = current.length > 0 ? Math.min(...current.map(quoteTotal)) : null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Supplier quotations — provenance & stale handling</h3>
      <p className="text-xs text-slate-500">Quotes tie to exact <code>materialsVersion={materialsVersion}</code>. If materials change, prior quotes show <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">stale — needs review</span>. Totals are deterministic.</p>

      {current.length >= 2 ? (
        <div className="card p-3">
          <h4 className="text-sm font-semibold">Comparison · current quotes only</h4>
          <table className="mt-2 w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left">Supplier</th><th className="text-left">Lines</th><th className="text-right">Total</th><th /></tr></thead>
            <tbody>
              {current.map((q) => {
                const t = quoteTotal(q);
                const isBest = best !== null && t === best;
                return (
                  <tr key={q.id} className={`border-t border-slate-100 ${isBest ? "bg-green-50" : ""}`}>
                    <td className="py-1">{q.supplier}</td>
                    <td>{q.items.length}</td>
                    <td className="text-right font-medium">{t.toFixed(2)} {q.currency}</td>
                    <td className="text-right">{isBest ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">lowest</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">Lowest total is informational only — verify scope, lead time, and warranty before choosing.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier (from document)" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <input value={provenance} onChange={(e) => setProvenance(e.target.value)} placeholder="Provenance ref (Quote #/date)" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <select value={currency} onChange={(e) => { setCurrency(e.target.value); setLines((prev) => prev.map((l) => ({ ...l, currency: e.target.value }))); }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"><option>AUD</option><option>USD</option><option>EUR</option><option>GBP</option></select>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Line description (from document)" className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            <input type="number" value={l.quantity} min={0} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            <input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="unit" className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            <input type="number" value={l.unitPrice} min={0} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} placeholder="price" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            {lines.length > 1 ? <button onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} className="btn-secondary text-xs">Remove</button> : null}
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={() => setLines((prev) => [...prev, { description: "", quantity: 1, unit: "pc", unitPrice: 0, currency }])} className="btn-secondary text-xs">Add line</button>
          <button onClick={addQuotation} disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : "Add quotation (provenance required)"}</button>
        </div>
      </div>
      {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <p className="text-xs text-slate-500">No fabricated prices — totals are deterministic from supplied line items. Changing materials marks prior quotes <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">stale — needs review</span>.</p>
      {quotes.length === 0 ? <div className="card p-6 text-center text-sm text-slate-500">No quotations — add from supplier document (provenance, date, currency, line items kept). No fabrication.</div> : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <div key={q.id} className={`card p-3 ${q.stale ? "border-amber-300 bg-amber-50" : ""}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-medium">{q.supplier} — {q.date} — {q.currency} — total {quoteTotal(q).toFixed(2)}</span>{q.stale ? <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">stale</span> : <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">current</span>}</div>
              <table className="mt-2 w-full text-sm"><thead className="text-xs text-slate-500"><tr><th className="text-left">Item</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{q.items.map((it, i) => <tr key={i} className="border-t border-slate-100"><td>{it.description}</td><td>{it.quantity} {it.unit}</td><td>{it.unitPrice} {it.currency}</td><td>{lineTotal(it).toFixed(2)} {it.currency}</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
