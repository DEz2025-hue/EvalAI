"use client";
import { useState } from "react";

type Item = { id: string; title: string; instructions?: string; required: boolean; category?: string };
type Response = { itemId: string; status: "pass" | "fail" | "needs_attention" | "not_applicable" | "not_checked"; notes?: string; measuredValue?: number; measuredUnit?: string };

export function ChecklistEditor({ items: initial, assessmentId }: { items: Item[]; assessmentId: string }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [responses, setResponses] = useState<Record<string, Response>>(
    Object.fromEntries(initial.map((it) => [it.id, { itemId: it.id, status: "not_checked" as const }]))
  );
  const [saving, setSaving] = useState(false);

  function updateStatus(id: string, status: Response["status"]) {
    setResponses((r) => ({ ...r, [id]: { ...r[id], status } }));
  }

  async function save() {
    setSaving(true);
    // Persist via /api/checklist/responses — enforces workspace RLS server-side
    try {
      await fetch("/api/checklist/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, responses: Object.values(responses) }),
      });
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    const title = prompt("New item title");
    if (!title) return;
    setItems((prev) => [...prev, { id: `tmp-${Date.now()}`, title, required: false }]);
  }

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const r = responses[it.id];
        return (
          <div key={it.id} className="card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{it.title} {it.required && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">required</span>}</div>
                {it.instructions && <p className="text-xs text-slate-600">{it.instructions}</p>}
                {it.category && <span className="badge bg-slate-100 text-slate-600 text-xs">{it.category}</span>}
              </div>
              <select value={r.status} onChange={(e) => updateStatus(it.id, e.target.value as Response["status"])} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                <option value="not_checked">Not Checked</option>
                <option value="pass">Pass</option>
                <option value="fail">Issue Found / Fail</option>
                <option value="needs_attention">Needs Attention</option>
                <option value="not_applicable">Not Applicable</option>
              </select>
            </div>
            <textarea placeholder="Observation / notes" value={r.notes ?? ""} onChange={(e) => setResponses((prev) => ({ ...prev, [it.id]: { ...prev[it.id], notes: e.target.value } }))} rows={2} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <div className="mt-2 flex gap-2">
              <input type="number" placeholder="Measured value" value={r.measuredValue ?? ""} onChange={(e) => setResponses((prev) => ({ ...prev, [it.id]: { ...prev[it.id], measuredValue: e.target.value ? Number(e.target.value) : undefined } }))} className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
              <input placeholder="Unit (e.g. m, kW)" value={r.measuredUnit ?? ""} onChange={(e) => setResponses((prev) => ({ ...prev, [it.id]: { ...prev[it.id], measuredUnit: e.target.value } }))} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
            </div>
            <p className="mt-1 text-xs text-slate-500">Not Checked ≠ Pass. Pass requires actual check and supporting evidence.</p>
          </div>
        );
      })}
      <div className="flex gap-2">
        <button onClick={addItem} className="btn-secondary text-xs">Add item</button>
        <button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : "Save checklist responses"}</button>
      </div>
      <p className="text-xs text-slate-500">Edits are versioned per assessment. AI suggestions remain drafts until you accept. Calculations stay deterministic.</p>
    </div>
  );
}
