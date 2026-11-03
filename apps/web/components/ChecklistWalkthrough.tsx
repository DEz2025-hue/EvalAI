"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerSync, aiFieldsFor, applyAnswer, fieldsFor, needsMeasurement, responseProblem, type FieldSuggestion, type ItemAnswers, type SaveResult } from "@eval-ai/shared";
import { useRole } from "./useRole";
import { PhotoCapture } from "./PhotoCapture";
import { ItemFieldsForm } from "./ItemFieldsForm";
import { SourceBadge, type ItemSource } from "./SourceBadge";
import { FormLoading } from "./Skeleton";

type Item = { id: string; title: string; required: boolean; instructions?: string; source?: ItemSource; rationale?: string };
/** `updatedAt` is when this answer was last saved (absent = never): sent back so a newer answer elsewhere isn't overwritten. */
type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string; answers?: ItemAnswers; updatedAt?: string };
type Filter = "all" | "todo" | "required";
type SaveState = "idle" | "unsaved" | "saving" | "saved";

const STATUSES = [
  { v: "not_checked", label: "Not Checked", badge: "bg-slate-100 text-slate-600" },
  { v: "pass", label: "Pass", badge: "bg-green-50 text-green-700" },
  { v: "fail", label: "Issue / Fail", badge: "bg-red-50 text-red-700" },
  { v: "needs_attention", label: "Needs Attention", badge: "bg-amber-50 text-amber-800" },
  { v: "not_applicable", label: "N/A", badge: "bg-sky-50 text-sky-700" },
];
const statusOf = (v: string) => STATUSES.find((s) => s.v === v) ?? STATUSES[0];

/** An answer is saved this long after the last change, and always before moving to another item. */
const AUTOSAVE_MS = 1500;

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
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [filter, setFilter] = useState<Filter>("all");
  const [measureOpen, setMeasureOpen] = useState<Set<string>>(new Set());
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // AI suggestions per item. They stay on screen until the person uses or dismisses them; nothing here is saved.
  const [suggestions, setSuggestions] = useState<Record<string, FieldSuggestion[]>>({});
  const [suggesting, setSuggesting] = useState(false);
  // The latest answers for saves started from timers and clicks (state in a closure can be a render behind).
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const sync = useMemo(
    () =>
      new AnswerSync(async (answer) => {
        const res = await fetch("/api/checklist/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, responses: [answer] }) });
        const data = (await res.json().catch(() => ({}))) as { error?: string; updatedAt?: string };
        return res.ok ? { ok: true as const, updatedAt: data.updatedAt ?? new Date().toISOString() } : { ok: false as const, status: res.status, error: data.error ?? "Save failed" };
      }),
    [id],
  );

  useEffect(() => {
    // A stale load (StrictMode double-run, or a quick id change) must never overwrite answers the user has already entered.
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/assessments/${id}`);
        const data = (await res.json().catch(() => ({}))) as { checklist?: Item[]; responses?: Resp[]; error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        const list = data.checklist ?? []; // real items only — never template rows with made-up ids
        const rList = data.responses ?? [];
        const map: Record<string, Resp> = {};
        for (const it of list) map[it.id] = rList.find((r) => r.itemId === it.id) ?? { itemId: it.id, status: "not_checked" };
        sync.load(rList, list.map((it) => it.id));
        setItems(list);
        setResponses(map);
        // Open at ?item=<id> (from the job page), otherwise at the first item not checked yet.
        const wanted = new URLSearchParams(window.location.search).get("item");
        const at = wanted ? list.findIndex((it) => it.id === wanted) : list.findIndex((it) => map[it.id].status === "not_checked");
        setIdx(at >= 0 ? at : 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, sync]);

  const cur = items[idx];
  const curResp = cur ? responses[cur.id] ?? { itemId: cur.id, status: "not_checked" } : null;

  function edit(patch: Partial<Resp>) {
    if (!cur) return;
    setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], ...patch } }));
    sync.edited(cur.id);
    setSaveState("unsaved");
    setError(null);
  }

  function editField(key: string, value: string | number | undefined) {
    if (!cur || !curResp) return;
    edit(applyAnswer(cur.title, curResp.status, curResp.answers, key, value));
    setSuggestions((m) => ({ ...m, [cur.id]: (m[cur.id] ?? []).filter((s) => s.key !== key) }));
  }

  function addSuggestions(list: FieldSuggestion[]) {
    if (!cur) return;
    setSuggestions((m) => ({ ...m, [cur.id]: [...(m[cur.id] ?? []).filter((s) => !list.some((n) => n.key === s.key)), ...list] }));
  }

  /** Ask the AI what the person's notes already answer. It only suggests: each one waits for a tap. */
  async function suggestFromNotes() {
    if (!cur || !curResp?.notes?.trim()) return;
    setSuggesting(true);
    setError(null);
    setPhotoNote(null);
    try {
      const res = await fetch("/api/ai/item-fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, itemId: cur.id, notes: curResp.notes }) });
      const data = (await res.json().catch(() => ({}))) as { suggestions?: FieldSuggestion[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI suggestions are unavailable");
      addSuggestions(data.suggestions ?? []);
      if (!data.suggestions?.length) setPhotoNote("The notes don't clearly answer any of these fields.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  /**
   * Save one item if it has unsaved changes. `showRules` is false for autosave: an answer that doesn't meet the rules yet
   * (a value typed before its unit) simply waits, and the rule is shown when the person moves on.
   */
  async function saveItem(itemId: string, showRules: boolean): Promise<boolean> {
    if (readOnly || !sync.isDirty(itemId)) return true;
    const item = items.find((it) => it.id === itemId);
    const r = responsesRef.current[itemId];
    if (!item || !r) return true;
    const problem = responseProblem(r, item);
    if (problem) {
      if (showRules) setError(problem);
      return false;
    }
    setSaveState("saving");
    const result = await sync.save({ itemId, status: r.status, notes: r.notes, measuredValue: r.measuredValue, measuredUnit: r.measuredUnit, answers: r.answers });
    if (result.ok) {
      setSaveState(sync.isDirty(itemId) ? "unsaved" : "saved");
      return true;
    }
    const fail = result as Extract<SaveResult, { ok: false }>;
    setSaveState("unsaved");
    setStale(fail.conflict);
    setError(fail.error);
    return false;
  }

  // Autosave after a short pause in typing or tapping.
  useEffect(() => {
    if (!cur || readOnly || !sync.isDirty(cur.id)) return;
    const t = window.setTimeout(() => void saveItem(cur.id, false), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-armed on every answer change
  }, [responses, cur?.id, readOnly]);

  // Leaving the page with an unsaved answer would lose it.
  useEffect(() => {
    if (saveState !== "unsaved" && saveState !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  async function go(to: number) {
    if (to === idx || to < 0 || to >= items.length) return;
    if (cur && !(await saveItem(cur.id, true))) return;
    setIdx(to);
    setStale(false);
    setPhotoNote(null);
  }

  async function finish() {
    if (cur && !(await saveItem(cur.id, true))) return;
    router.push(`${basePath}/${id}/completeness` as never);
  }

  /** After a refused save: replace this item's answer with the one saved elsewhere (the edits on screen are dropped). */
  async function loadLatest() {
    if (!cur) return;
    setError(null);
    try {
      const res = await fetch(`/api/checklist/responses?assessmentId=${id}`);
      const data = (await res.json().catch(() => ({}))) as { responses?: Resp[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load the latest answer");
      const latest = (data.responses ?? []).find((r) => r.itemId === cur.id) ?? { itemId: cur.id, status: "not_checked" };
      sync.adopt(cur.id, latest.updatedAt);
      setResponses((m) => ({ ...m, [cur.id]: latest }));
      setStale(false);
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <FormLoading label="Loading checklist…" />;
  if (!cur || !curResp) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-10 text-sm">
        {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        <p>This job has no checklist items yet.</p>
        <button onClick={() => router.push(`${basePath}/${id}/checklist-builder` as never)} className="btn-primary text-sm">Open the checklist builder</button>
      </div>
    );
  }

  const checked = items.filter((it) => (responses[it.id]?.status ?? "not_checked") !== "not_checked").length;
  const pct = Math.round((checked / items.length) * 100);
  const visible = items
    .map((it, i) => ({ it, i, status: responses[it.id]?.status ?? "not_checked" }))
    .filter(({ it, status }) => filter === "all" || (status === "not_checked" && (filter === "todo" || it.required)));
  const hasFields = !!fieldsFor(cur.title);
  // Items with fields ask for their numbers there; the free measurement stays one tap away.
  const showMeasure = (needsMeasurement(cur.title) && !hasFields) || curResp.measuredValue !== undefined || measureOpen.has(cur.id);
  const last = idx >= items.length - 1;
  const savedLabel = saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Not saved yet" : saveState === "saved" ? "Saved" : "";

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{label} checklist · item {idx + 1} of {items.length}</h1>
          <span aria-live="polite" className={`text-xs ${saveState === "unsaved" ? "text-amber-700" : "text-slate-500"}`}>{savedLabel}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={checked} aria-valuemin={0} aria-valuemax={items.length}>
          <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-slate-500">{checked} of {items.length} checked</p>
      </div>

      <details className="card p-3">
        <summary className="cursor-pointer text-sm font-medium">All items</summary>
        <div className="mt-2 flex gap-1 text-xs" role="group" aria-label="Show">
          {([["all", "All"], ["todo", "Not checked"], ["required", "Required, not checked"]] as const).map(([f, l]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-2 py-0.5 ${filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>{l}</button>
          ))}
        </div>
        <ol className="mt-2 divide-y divide-slate-100">
          {visible.map(({ it, i, status }) => (
            <li key={it.id}>
              <button type="button" onClick={() => void go(i)} aria-current={i === idx ? "step" : undefined} className={`flex w-full items-center gap-2 px-1 py-1.5 text-left text-sm ${i === idx ? "font-semibold" : ""}`}>
                <span className="w-6 text-xs text-slate-400">{i + 1}</span>
                <span className="flex-1">{it.title}</span>
                {it.required && status === "not_checked" ? <span className="text-xs text-red-700">required</span> : null}
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusOf(status).badge}`}>{statusOf(status).label}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 ? <li className="py-2 text-xs text-slate-500">Nothing left in this list.</li> : null}
        </ol>
      </details>

      {isInspection ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Inspection must not imply certification unless separately authorized. Pass only when checked and evidence supports it.</div>
      ) : null}
      {readOnly ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only — you can browse but not change answers.</div> : null}

      <fieldset disabled={readOnly} className="card p-4 space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            <span className={`rounded px-1.5 py-0.5 text-xs ${cur.required ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{cur.required ? "required" : "optional"}</span>
            {cur.source && cur.source !== "established" ? <SourceBadge source={cur.source} /> : null}
          </div>
          <h2 className="font-semibold text-slate-900">{cur.title}</h2>
          {cur.instructions ? <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-medium">Look for: </span>{cur.instructions}</p> : null}
          {cur.rationale ? <p className="text-xs text-slate-500">Why: {cur.rationale}</p> : null}
        </div>
        <ItemFieldsForm title={cur.title} answers={curResp.answers} onChange={editField} suggestions={suggestions[cur.id]} onDismiss={(key) => setSuggestions((m) => ({ ...m, [cur.id]: (m[cur.id] ?? []).filter((s) => s.key !== key) }))} />
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button key={s.v} type="button" aria-pressed={curResp.status === s.v} onClick={() => edit({ status: s.v })} className={`text-xs px-3 py-1.5 rounded-full border ${curResp.status === s.v ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>{s.label}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{hasFields ? "The result follows your answers. You can still choose Issue / Fail or N/A. " : ""}Not Checked ≠ Pass.{cur.required ? " Not Applicable needs a reason in the notes." : ""}</p>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Observation / notes</span>
          <textarea value={curResp.notes ?? ""} onChange={(e) => edit({ notes: e.target.value })} placeholder="Observation, defects, limitations" className="w-full rounded border border-slate-200 px-3 py-2 text-sm min-h-[80px]" />
          {aiFieldsFor(cur.title).length > 0 && curResp.notes?.trim() ? <button type="button" onClick={() => void suggestFromNotes()} disabled={suggesting} className="text-xs text-slate-600 underline">{suggesting ? "Reading your notes…" : "Suggest answers from my notes"}</button> : null}
        </label>
        {showMeasure ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Measured value</span>
              <input type="number" step="any" value={curResp.measuredValue ?? ""} onChange={(e) => edit({ measuredValue: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 12.5" className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Unit</span>
              <input value={curResp.measuredUnit ?? ""} onChange={(e) => edit({ measuredUnit: e.target.value })} placeholder="m, kW, m²" className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>
        ) : (
          <button type="button" onClick={() => setMeasureOpen((s) => new Set(s).add(cur.id))} className="text-xs text-slate-600 underline">Add a measurement</button>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Add a photo to this item</summary>
          <div className="mt-2">
            <PhotoCapture key={cur.id} assessmentId={id} itemId={cur.id} onUploaded={() => setPhotoNote("Photo saved and linked to this item.")} onSuggestions={addSuggestions} />
            {photoNote ? <p role="status" className="mt-1 text-xs text-green-700">{photoNote}</p> : null}
          </div>
        </details>
        {error ? (
          <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
            {stale ? <button type="button" onClick={loadLatest} className="ml-2 underline">Load the latest answer</button> : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => void go(idx - 1)} disabled={idx === 0 || saveState === "saving"} className="btn-secondary text-sm disabled:opacity-50">← Previous</button>
          {last ? (
            <button type="button" onClick={() => void finish()} disabled={saveState === "saving"} className="btn-primary text-sm">Finish → completeness review</button>
          ) : (
            <button type="button" onClick={() => void go(idx + 1)} disabled={saveState === "saving"} className="btn-primary text-sm">Next →</button>
          )}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => router.push(`${basePath}/${id}/checklist-builder` as never)} className="btn-secondary text-sm">Builder</button>
        <button onClick={() => router.push(`${basePath}/${id}/evidence` as never)} className="btn-secondary text-sm">Evidence gallery</button>
        <button onClick={() => router.push(`${basePath}/${id}/completeness` as never)} className="btn-secondary text-sm">Completeness review</button>
        <button onClick={() => router.push(`${basePath}/${id}` as never)} className="btn-secondary text-sm">Back to {label.toLowerCase()}</button>
      </div>
    </div>
  );
}
