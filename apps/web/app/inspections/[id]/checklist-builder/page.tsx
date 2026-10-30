"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PACK_TEMPLATES } from "@eval-ai/shared";

type Item = { id: string; title: string; required: boolean; category?: string };

export default function InspectionChecklistBuilderPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/assessments/${id}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data as { checklist?: Item[] }).checklist?.length) {
          setItems((data as { checklist: Item[] }).checklist);
        } else {
          const pack = (data as { pack?: "solar" | "cctv" })?.pack ?? "solar";
          const t = PACK_TEMPLATES[pack];
          setItems(t.checklist.map((title, i) => ({ id: `${id}_item_${i}`, title, required: i < 5, category: i < 2 ? "Site" : "System" })));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function updateTitle(idx: number, title: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, title } : it)));
  }
  function removeAt(idx: number) {
    const it = items[idx];
    if (it.required && !confirm(`Remove required item "${it.title}"?`)) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    setItems((prev) => {
      const a = [...prev];
      const [v] = a.splice(idx, 1);
      a.splice(j, 0, v);
      return a;
    });
  }
  function addItem() {
    const title = prompt("New item title");
    if (!title) return;
    setItems((prev) => [...prev, { id: `${id}_custom_${Date.now()}`, title, required: false }]);
  }

  async function confirmChecklist() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/checklist/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: id, items: items.map((it) => ({ id: it.id, title: it.title, required: it.required, category: it.category })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not save checklist");
      router.push(`/inspections/${id}/checklist`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Loading checklist builder…</div>;

  const requiredCount = items.filter((it) => it.required).length;
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inspection checklist builder</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)} · {items.length} items · {requiredCount} required</span>
      </div>
      <p className="text-sm text-slate-600">Review grouped items, edit text where permitted, add/remove/reorder. Required items warn before removal.</p>
      {error ? <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
      <div className="flex gap-2">
        <button onClick={addItem} className="btn-secondary text-sm">Add item</button>
        <button onClick={confirmChecklist} disabled={saving} className="btn-primary text-sm">{saving ? "Confirming…" : `Confirm checklist (${items.length}) →`}</button>
        <button onClick={() => router.push(`/inspections/${id}/clarify`)} className="btn-secondary text-sm">Back to Clarify</button>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.id} className="card p-3 flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${it.required ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-100 text-slate-600"}`}>{it.required ? "required" : "optional"}</span>
                {it.category ? <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{it.category}</span> : null}
              </div>
              <input value={it.title} onChange={(e) => updateTitle(idx, e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => move(idx, -1)} className="btn-secondary text-xs px-2 py-1">↑</button>
              <button onClick={() => move(idx, 1)} className="btn-secondary text-xs px-2 py-1">↓</button>
              <button onClick={() => removeAt(idx)} className="btn-secondary text-xs px-2 py-1 text-red-600">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
