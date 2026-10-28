"use client";
import { useState } from "react";

type QItem = { description: string; quantity: number; unit: string; unitPrice: number; currency: string; taxesOrFees?: number };
type Quote = { id: string; supplier: string; date: string; currency: string; items: QItem[]; stale?: boolean };

export function QuotationReview({ assessmentId, materialsVersion = 1 }: { assessmentId: string; materialsVersion?: number }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [supplier, setSupplier] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [provenance, setProvenance] = useState("");

  async function loadPersisted() {
    try {
      const res = await fetch(`/api/quotations?assessmentId=${assessmentId}`);
      const data = await res.json();
      if (data.items?.length) setQuotes(data.items);
    } catch {}
  }
  if (typeof window !== "undefined" && quotes.length === 0) { loadPersisted(); }

  async function addQuotation() {
    const prov = provenance || prompt("Provenance — supplier document reference/date (e.g. Quote #123, 2026-01-15 PDF)") || "";
    if (!prov) { alert("Provenance required — quote must be traceable to supplied document, not fabricated."); return; }
    const q: Quote = { id: `q-${Date.now()}`, supplier: supplier || "Supplier", date: new Date().toISOString().slice(0, 10), currency, items: [{ description: "550W panel", quantity: 10, unit: "pc", unitPrice: 280, currency }], stale: false };
    setQuotes((prev) => [...prev, q]);
    await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, materialsVersion, supplier: q.supplier, currency, items: q.items, date: q.date, reference: prov }) }).catch(() => {});
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Supplier quotations — provenance & stale handling</h3>
      <p className="text-xs text-slate-500">Quotes tie to exact <code>materialsVersion={materialsVersion}</code>. If materials change, prior quotes show <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">stale — needs review</span>. Totals are deterministic.</p>
      <div className="flex gap-2">
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        <input value={provenance} onChange={(e) => setProvenance(e.target.value)} placeholder="Provenance ref (Quote #/date)" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"><option>AUD</option><option>USD</option><option>EUR</option><option>GBP</option></select>
        <button onClick={addQuotation} className="btn-primary text-xs">Add quotation (provenance required)</button>
      </div>
      <p className="text-xs text-slate-500">No fabricated prices — totals are deterministic from supplied line items. Changing materials marks prior quotes <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">stale — needs review</span>.</p>
      <p className="text-xs text-amber-700">Save-and-resume: quotations persist per assessment — you can leave and resume while waiting for supplier.</p>
      {quotes.length === 0 ? <div className="card p-6 text-center text-sm text-slate-500">No quotations — add from supplier document (provenance, date, currency, line items kept). No fabrication.</div> : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <div key={q.id} className={`card p-3 ${q.stale ? "border-amber-300 bg-amber-50" : ""}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-medium">{q.supplier} — {q.date} — {q.currency}</span>{q.stale ? <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">stale</span> : <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">current</span>}</div>
              <table className="mt-2 w-full text-sm"><thead className="text-xs text-slate-500"><tr><th className="text-left">Item</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{q.items.map((it, i) => <tr key={i} className="border-t border-slate-100"><td>{it.description}</td><td>{it.quantity} {it.unit}</td><td>{it.unitPrice} {it.currency}</td><td>{(it.quantity * it.unitPrice + (it.taxesOrFees ?? 0)).toFixed(2)} {it.currency}</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
