"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "./useRole";

type Item = { id: string; title: string; required: boolean };
type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string };

const STATUSES = [
  { v: "not_checked", label: "Not Checked" },
  { v: "pass", label: "Pass" },
  { v: "fail", label: "Issue / Fail" },
  { v: "needs_attention", label: "Needs Attention" },
  { v: "not_applicable", label: "N/A" },
];

export function ChecklistWalkthrough({ id, basePath }: { id: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const { canWrite, loaded } = useRole();
  const readOnly = loaded && !canWrite;
  const isInspection = basePath === "/inspections";
  const label = isInspection ? "Inspection" : "Assessment";
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Record<string, Resp>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/assessments/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load");
        const stored = (data as { checklist?: Item[] }).checklist;
        const list = stored ?? []; // real items only — never template rows with made-up ids
        setItems(list);
        const rList = ((data as { responses?: Resp[] }).responses ?? []) as Resp[];
        const map: Record<string, Resp> = {};
        for (const it of list) map[it.id] = rList.find((r) => r.itemId === it.id) ?? { itemId: it.id, status: "not_checked" };
        setResponses(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const cur = items[idx];
  const curResp = cur ? responses[cur.id] ?? { itemId: cur.id, status: "not_checked" } : null;

  /** Returns true only when the answer was saved (or there is nothing to save). */
  async function saveOne(): Promise<boolean> {
    if (!cur || !curResp) return true;
    if (readOnly) return true;
    setError(null);
    if (curResp.measuredValue !== undefined && !(curResp.measuredUnit ?? "").trim()) {
      setError("Add a unit for the measured value (for example m, kW, V).");
      return false;
    }
    if (curResp.status === "not_applicable" && cur.required && !(curResp.notes ?? "").trim()) {
      setError("Not Applicable on a required item needs a reason in the notes.");
      return false;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/checklist/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, responses: [curResp] }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Loading checklist…</div>;
  if (!cur) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-10 text-sm">
        {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        <p>This job has no checklist items yet.</p>
        <button onClick={() => router.push(`${basePath}/${id}/checklist-builder` as never)} className="btn-primary text-sm">Open the checklist builder</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{label} checklist · item {idx + 1} / {items.length}</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)} · {cur.required ? "required" : "optional"}</span>
      </div>
      {isInspection ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Inspection must not imply certification unless separately authorized. Pass only when checked and evidence supports it.</div>
      ) : null}
      {readOnly ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only — you can browse but not change answers.</div> : null}
      <fieldset disabled={readOnly} className="card p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">{cur.title}</h2>
          <p className="text-xs text-slate-500">Not Applicable needs a reason if required. Not Checked ≠ Pass.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s.v} onClick={() => setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], status: s.v } }))} className={`text-xs px-3 py-1.5 rounded-full border ${curResp?.status === s.v ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>{s.label}</button>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Observation / notes</span>
          <textarea value={curResp?.notes ?? ""} onChange={(e) => setResponses((m) => ({ ...m, [cur!.id]: { ...m[cur!.id], notes: e.target.value } }))} placeholder="Observation, defects, limitations" className="w-full rounded border border-slate-200 px-3 py-2 text-sm min-h-[80px]" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Measured value</span>
            <input type="number" value={curResp?.measuredValue ?? ""} onChange={(e) => setResponses((m) => ({ ...m, [cur!.id]: { ...m[cur!.id], measuredValue: e.target.value ? Number(e.target.value) : undefined } }))} placeholder="e.g. 12.5" className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Unit</span>
            <input value={curResp?.measuredUnit ?? ""} onChange={(e) => setResponses((m) => ({ ...m, [cur!.id]: { ...m[cur!.id], measuredUnit: e.target.value } }))} placeholder="m, kW, m²" className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
        {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        <div className="flex gap-2">
          <button onClick={saveOne} disabled={saving} className="btn-primary text-sm">{saving ? "Saving…" : "Save"}</button>
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="btn-secondary text-sm disabled:opacity-50">← Previous</button>
          <button onClick={async () => { if (!(await saveOne())) return; setIdx((i) => Math.min(items.length - 1, i + 1)); }} disabled={idx >= items.length - 1 || saving} className="btn-secondary text-sm disabled:opacity-50">Next →</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.push(`${basePath}/${id}/evidence` as never)} className="btn-secondary text-xs">Photo / Evidence (gallery)</button>
          <button onClick={() => router.push(`${basePath}/${id}/completeness` as never)} className="btn-secondary text-xs">Completeness review →</button>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button onClick={() => router.push(`${basePath}/${id}/checklist-builder` as never)} className="btn-secondary text-sm">Builder</button>
        <button onClick={() => router.push(`${basePath}/${id}` as never)} className="btn-secondary text-sm">Back to {label.toLowerCase()}</button>
      </div>
    </div>
  );
}
