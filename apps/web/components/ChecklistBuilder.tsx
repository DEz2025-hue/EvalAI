"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SourceBadge, type ItemSource } from "./SourceBadge";
import { useRole } from "./useRole";

type Item = { id: string; title: string; required: boolean; category?: string; instructions?: string; source: ItemSource; rationale?: string };

/**
 * Checklist builder shared by Assessments and Inspections.
 * Each item shows where it came from (pack requirement / added by you / AI suggestion). AI suggestions
 * are fetched only when asked for, are labelled, and are saved only when you confirm the checklist.
 */
export function ChecklistBuilder({ id, basePath }: { id: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const router = useRouter();
  const { canWrite, loaded } = useRole();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${id}`);
      const data = (await res.json().catch(() => ({}))) as { checklist?: Array<Omit<Item, "source"> & { source?: ItemSource }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load the checklist");
      setItems((data.checklist ?? []).map((it) => ({ ...it, source: it.source ?? "established" })));
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Leaving with unsaved edits would silently lose them.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (fn: (prev: Item[]) => Item[]) => {
    setItems(fn);
    setDirty(true);
  };

  function updateTitle(idx: number, title: string) {
    // Editing a pack requirement makes it your wording, so it no longer claims to be the standard text.
    change((prev) => prev.map((it, i) => (i === idx ? { ...it, title, source: it.source === "established" ? "user" : it.source } : it)));
  }
  function toggleRequired(idx: number) {
    change((prev) => prev.map((it, i) => (i === idx ? { ...it, required: !it.required } : it)));
  }
  function removeAt(idx: number) {
    const it = items[idx];
    if (it.required && !confirm(`Remove required item "${it.title}"? Responses recorded against it will be deleted.`)) return;
    change((prev) => prev.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    change((prev) => {
      const a = [...prev];
      const [v] = a.splice(idx, 1);
      a.splice(j, 0, v);
      return a;
    });
  }
  function addItem() {
    const title = prompt("New item title");
    if (!title?.trim()) return;
    change((prev) => [...prev, { id: `new_${Date.now()}`, title: title.trim(), required: false, source: "user" }]);
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id }) });
      const data = (await res.json().catch(() => ({}))) as { items?: Array<{ title: string; rationale?: string; category?: string; instructions?: string }>; error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.error ?? "AI suggestions are unavailable — continue with the checklist you have");
      const existing = new Set(items.map((i) => i.title.trim().toLowerCase()));
      const fresh = (data.items ?? []).filter((s) => s.title && !existing.has(s.title.trim().toLowerCase())).slice(0, 10);
      if (fresh.length === 0) {
        setNotice("No new suggestions — the checklist already covers what the AI proposed.");
        return;
      }
      change((prev) => [...prev, ...fresh.map((s, i) => ({ id: `ai_${Date.now()}_${i}`, title: s.title, required: false, category: s.category ?? "AI suggested", instructions: s.instructions, source: "ai_suggested" as const, rationale: s.rationale }))]);
      setNotice(`${fresh.length} AI suggestion(s) added at the end — review each one, then remove or keep it.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  async function confirmChecklist() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/checklist/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: id, items: items.map((it) => ({ id: it.id, title: it.title, required: it.required, category: it.category, instructions: it.instructions, source: it.source, rationale: it.rationale })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save checklist");
      setDirty(false);
      router.push(`${basePath}/${id}/checklist` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Loading checklist builder…</div>;

  const requiredCount = items.filter((it) => it.required).length;
  const aiCount = items.filter((it) => it.source === "ai_suggested").length;
  const readOnly = loaded && !canWrite;
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Checklist builder</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)} · {items.length} items · {requiredCount} required{aiCount ? ` · ${aiCount} AI` : ""}</span>
      </div>
      <p className="text-sm text-slate-600">Each item shows where it came from. Pack requirements, your own items and AI suggestions are kept apart — an AI suggestion is never treated as a requirement until you keep it and confirm the checklist.</p>
      {readOnly ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only — you can review the checklist but not change it.</div> : null}
      {error ? <div role="alert" className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">{notice}</div> : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={addItem} className="btn-secondary text-sm">Add item</button>
          <button onClick={suggest} disabled={suggesting} className="btn-secondary text-sm">{suggesting ? "Asking AI…" : "Suggest more with AI"}</button>
          <button onClick={confirmChecklist} disabled={saving || items.length === 0} className="btn-primary text-sm">{saving ? "Saving…" : `Confirm checklist (${items.length}) →`}</button>
          <button onClick={() => router.push(`${basePath}/${id}/clarify` as never)} className="btn-secondary text-sm">Back to scope questions</button>
        </div>
      ) : null}
      {items.length === 0 && !error ? <div className="card p-6 text-sm text-slate-500 text-center">This job has no checklist items yet. Add items or ask AI for suggestions.</div> : null}
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.id} className="card p-3 flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!canWrite} onClick={() => toggleRequired(idx)} title="Toggle required" className={`text-xs px-2 py-0.5 rounded-full ${it.required ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-100 text-slate-600"}`}>{it.required ? "required" : "optional"}</button>
                <SourceBadge source={it.source} />
                {it.category ? <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{it.category}</span> : null}
              </div>
              <input value={it.title} disabled={!canWrite} onChange={(e) => updateTitle(idx, e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
              {it.rationale ? <p className="text-xs text-slate-500">Why: {it.rationale}</p> : null}
            </div>
            {canWrite ? (
              <div className="flex flex-col gap-1">
                <button onClick={() => move(idx, -1)} className="btn-secondary text-xs px-2 py-1" aria-label="Move up">↑</button>
                <button onClick={() => move(idx, 1)} className="btn-secondary text-xs px-2 py-1" aria-label="Move down">↓</button>
                <button onClick={() => removeAt(idx)} className="btn-secondary text-xs px-2 py-1 text-red-600">Remove</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
