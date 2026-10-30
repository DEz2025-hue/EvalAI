"use client";
import { useState } from "react";

type Item = { id: string; description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "measurement"|"finding"|"rule"|"user_input"; provisional?: boolean; assumptions?: string[] };

export function MaterialsList({ assessmentId, initial = [] as Item[], version = 1, onChange }: { assessmentId: string; initial?: Item[]; version?: number; onChange?: (items: Item[], version: number) => void }): JSX.Element {
  const [items, setItems] = useState<Item[]>(initial);
  const [saving, setSaving] = useState(false);
  // Save-and-resume: load persisted materials on mount so user can leave and resume later
  const [loaded, setLoaded] = useState(false);
  const [resumeNote, setResumeNote] = useState<string | null>(null);

  // Load persisted materials for draft/resume
  const loadPersisted = async () => {
    try {
      const res = await fetch(`/api/materials?assessmentId=${assessmentId}`);
      const data = await res.json();
      if (data.items?.length) {
        setItems(data.items);
        setResumeNote(`Resumed ${data.count} persisted items — save to bump to v${version + 1}`);
      }
    } catch {}
    setLoaded(true);
  };
  // Auto-load on mount
  if (!loaded && typeof window !== "undefined") { setLoaded(true); loadPersisted(); }

  function add() {
    const desc = prompt("Item description (e.g. 550W mono panel — trace to finding/measurement ID)");
    if (!desc) return;
    const qtyStr = prompt("Quantity (number) — must trace to measurement/finding/rule/user_input. Leave blank to mark provisional");
    const qty = qtyStr ? Number(qtyStr) : NaN;
    let provisional = false;
    let finalQty = qty;
    if (!Number.isFinite(qty) || qty <= 0) {
      const markProv = confirm("Quantity missing/invalid — mark as provisional (clearly identified, not fabricated) and continue?");
      if (!markProv) return;
      provisional = true;
      finalQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    }
    const unit = prompt("Unit (e.g. pc, m, kW)") || "pc";
    const rationale = prompt("Rationale / source *required* (e.g. finding #3 + measurement roof-area 120m², or rule: 1 panel per 2m²). Be specific — this is the trace.") || "";
    if (rationale.length < 10) { alert("Rationale too short — must be ≥10 chars describing source (finding ID, measurement, rule, or user_input + assumptions)."); return; }
    const src = (prompt("Source: measurement / finding / rule / user_input", "user_input") ?? "user_input") as Item["source"];
    const assumptions = provisional ? ["Quantity provisional — missing critical input"] : [];
    const it: Item = { id: `tmp-${Date.now()}`, description: desc, quantity: finalQty, unit, rationale, source: src, provisional, assumptions };
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
        <h3 className="text-sm font-semibold">Materials schedule — traceable {version ? `· v${version}` : ""} {resumeNote ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">{resumeNote}</span> : null}</h3>
        <span className="text-xs text-slate-500">Each item needs rationale + source. <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">Provisional</span> when inputs missing — clearly identified, never hidden.</span>
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
      <p className="text-xs text-slate-500">If you change materials, existing quotes are marked as out of date — you will need fresh quotes before finalising.</p>
    </div>
  );
}
