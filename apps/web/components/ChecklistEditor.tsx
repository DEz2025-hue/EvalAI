"use client";
import { useEffect, useState } from "react";
import { SourceBadge } from "./SourceBadge";

type Item = { id: string; title: string; instructions?: string; required: boolean; category?: string; source?: string };
type Response = { itemId: string; status: "pass" | "fail" | "needs_attention" | "not_applicable" | "not_checked"; notes?: string; measuredValue?: number; measuredUnit?: string };

export function ChecklistEditor({ items: initial, assessmentId }: { items: Item[]; assessmentId: string }): JSX.Element {
  const [items, setItems] = useState<Item[]>(initial);
  const [responses, setResponses] = useState<Record<string, Response>>(
    Object.fromEntries(initial.map((it) => [it.id, { itemId: it.id, status: "not_checked" as const }]))
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Keep editor in sync when the parent loads stored items after us
  useEffect(() => {
    setItems(initial);
    setResponses((prev) => {
      const next: Record<string, Response> = {};
      for (const it of initial) next[it.id] = prev[it.id] ?? { itemId: it.id, status: "not_checked" as const };
      return next;
    });
  }, [initial]);

  // Resume: load previously saved responses
  useEffect(() => {
    fetch(`/api/checklist/responses?assessmentId=${assessmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = (data?.responses ?? []) as Response[];
        if (list.length > 0) {
          setResponses((prev) => {
            const next = { ...prev };
            for (const r of list) if (next[r.itemId]) next[r.itemId] = r;
            return next;
          });
        }
      })
      .catch(() => {});
  }, [assessmentId]);

  function updateStatus(id: string, status: Response["status"]) {
    setResponses((r) => ({ ...r, [id]: { ...r[id], status } }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // Step 1: persist the item list itself (new/edited titles, order) — returns real ids.
      const putRes = await fetch("/api/checklist/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, items: items.map((it) => ({ id: it.id, title: it.title, instructions: it.instructions, required: it.required, category: it.category })) }),
      });
      const putData = await putRes.json().catch(() => ({}));
      if (!putRes.ok) throw new Error((putData as { error?: string }).error ?? "Could not save checklist items");
      const rows = ((putData as { items?: Item[] }).items ?? []);
      if (rows.length === items.length) {
        setItems(rows);
        // Re-key responses by position so they follow the persisted rows
        const rekeyed: Record<string, Response> = {};
        items.forEach((old, i) => {
          const r = responses[old.id];
          if (r) rekeyed[rows[i].id] = { ...r, itemId: rows[i].id };
        });
        setResponses(rekeyed);
        // Step 2: persist statuses/notes/measurements against the real ids
        const respRes = await fetch("/api/checklist/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assessmentId, responses: Object.values(rekeyed) }),
        });
        const respData = await respRes.json().catch(() => ({}));
        if (!respRes.ok) throw new Error((respData as { error?: string }).error ?? "Could not save responses");
        setMsg(`Saved ${rows.length} items + responses${(putData as { persisted?: boolean }).persisted ? " to Supabase" : " to local fallback"}.`);
      } else {
        setMsg("Items saved, but response mapping mismatched — reload before editing further.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    const title = prompt("New item title");
    if (!title) return;
    const it: Item = { id: `tmp-${Date.now()}`, title, required: false };
    setItems((prev) => [...prev, it]);
    setResponses((prev) => ({ ...prev, [it.id]: { itemId: it.id, status: "not_checked" as const } }));
  }

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const r = responses[it.id] ?? { itemId: it.id, status: "not_checked" as const };
        return (
          <div key={it.id} className="card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{it.title} {it.required && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">required</span>}</div>
                {it.instructions && <p className="text-xs text-slate-600">{it.instructions}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1"><SourceBadge source={it.source} />{it.category && <span className="badge bg-slate-100 text-slate-600 text-xs">{it.category}</span>}</div>
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
      {msg && <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{msg}</p>}
      <p className="text-xs text-slate-500">Edits are versioned per assessment. AI suggestions remain drafts until you accept. Calculations stay deterministic.</p>
    </div>
  );
}
