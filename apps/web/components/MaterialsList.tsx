"use client";
import { useState } from "react";

type Item = { id: string; description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional?: boolean; assumptions?: string[] };

export function MaterialsList({ assessmentId, initial = [] as Item[], version = 1, onChange }: { assessmentId: string; initial?: Item[]; version?: number; onChange?: (items: Item[], version: number) => void }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [saving, setSaving] = useState(false);

  function add() {
    const desc = prompt("Item description (e.g. 550W mono panel)");
    if (!desc) return;
    const qtyStr = prompt("Quantity (number) — must trace to measurement/finding/rule/user_input");
    const qty = qtyStr ? Number(qtyStr) : NaN;
    if (!Number.isFinite(qty) || qty <= 0) { alert("Quantity must be >0 or mark provisional"); return; }
    const unit = prompt("Unit (e.g. pc, m, kW)") || "pc";
    const rationale = prompt("Rationale / source (e.g. linked to finding #3 + 120m2 roof measurement)") || "user_input";
    const it: Item = { id: `tmp-${Date.now()}`, description: desc, quantity: qty, unit, rationale, source: "user_input", provisional: false };
    const next = [...items, it];
    setItems(next);
    onChange?.(next, version);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, items, version }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`Saved materials v${data.version} — quotations for prior versions now stale`);
      onChange?.(items, data.version);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Materials schedule — traceable {version ? `· v${version}` : ""}</h3>
        <span className="text-xs text-slate-500">Each item needs rationale + source. Provisional if missing critical inputs.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="text-left p-2">Description</th><th className="p-2">Qty</th><th className="p-2">Rationale</th><th className="p-2">Prov.</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-slate-500">No materials — add items or generate from findings/measurements</td></tr> : items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100"><td className="p-2">{it.description}{it.specification ? ` — ${it.specification}` : ""}</td><td className="p-2">{it.quantity} {it.unit}</td><td className="p-2 text-xs">{it.rationale} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{it.source}</span></td><td className="p-2">{it.provisional ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">provisional</span> : "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button onClick={add} className="btn-secondary text-xs">Add item</button>
        <button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : `Save v${version + 1}`}</button>
      </div>
      <p className="text-xs text-slate-500">Changing materials increments version and marks prior quotations stale — see <code>mark_quotations_stale</code> trigger. Prices never invented — only from quotations.</p>
    </div>
  );
}
