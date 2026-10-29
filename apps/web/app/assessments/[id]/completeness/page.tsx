"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PACK_TEMPLATES } from "@eval-ai/shared";

type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number };

export default function CompletenessPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const router = useRouter();
  const [responses, setResponses] = useState<Resp[]>([]);
  const [storedItems, setStoredItems] = useState<Array<{ id: string; title: string }> | null>(null);
  const [materialsCount, setMaterialsCount] = useState<number | null>(null);
  const [packs, setPacks] = useState<"solar" | "cctv">("solar");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/assessments/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed");
        setResponses(((data as { responses?: Resp[] }).responses ?? []) as Resp[]);
        setPacks((data as { pack?: "solar" | "cctv" })?.pack ?? "solar");
        const stored = (data as { checklist?: Array<{ id: string; title: string }> }).checklist;
        if (stored?.length) setStoredItems(stored);
        const matRes = await fetch(`/api/materials?assessmentId=${id}`).catch(() => null as unknown as Response);
        if (matRes?.ok) {
          const md = await matRes.json().catch(() => ({}));
          setMaterialsCount(((md as { count?: number }).count ?? (md as { items?: unknown[] }).items?.length) ?? 0);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const summary = useMemo(() => {
    // Completeness over STORED items (builder edits included), not the raw template.
    const list = storedItems ?? PACK_TEMPLATES[packs].checklist.map((title, i) => ({ id: `${id}_item_${i}`, title }));
    const total = list.length;
    const byId: Record<string, string> = {};
    for (const r of responses) byId[r.itemId] = r.status;
    let pass = 0, fail = 0, attention = 0, na = 0, notChecked = 0, missingMeasure = 0;
    const items = list.map(({ id: itemId, title }, i) => {
      const st = byId[itemId] ?? "not_checked";
      if (st === "pass") pass++; else if (st === "fail") fail++; else if (st === "needs_attention") attention++; else if (st === "not_applicable") na++; else notChecked++;
      const needsMeasure = title.toLowerCase().includes("measurement");
      const hasMeasure = responses.find((r) => r.itemId === itemId && r.measuredValue !== undefined);
      if (needsMeasure && !hasMeasure) missingMeasure++;
      return { idx: i, title, status: st, itemId, needsMeasure, hasMeasure: !!hasMeasure };
    });
    const blockers: Array<{ reason: string; link: string }> = [];
    const warnings: Array<{ reason: string; link: string }> = [];
    for (const it of items) {
      if (it.status === "not_checked") blockers.push({ reason: `Item ${it.idx + 1} “${it.title}” is Not Checked — must be checked before finalize`, link: `/assessments/${id}/checklist` });
      if (it.status === "fail") warnings.push({ reason: `Item ${it.idx + 1} “${it.title}” flagged Issue/Fail — review evidence`, link: `/assessments/${id}/checklist` });
      if (it.needsMeasure && !it.hasMeasure) warnings.push({ reason: `Measurement missing for “${it.title}”`, link: `/assessments/${id}/checklist` });
    }
    if (materialsCount === 0) warnings.push({ reason: "No materials list — report can be generated without materials (M18 allows omission)", link: `/assessments/${id}/materials` });
    return { total, pass, fail, attention, na, notChecked, missingMeasure, items, blockers, warnings };
  }, [responses, materialsCount, packs, id, storedItems]);

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Computing completeness…</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">M17/W11 · Completeness Review</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)} · {packs}</span>
      </div>
      {error ? <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <div className="card p-4 grid grid-cols-3 gap-2 text-center">
        <div><div className="text-xl font-bold">{summary.pass}</div><div className="text-xs text-slate-500">Pass</div></div>
        <div><div className="text-xl font-bold text-amber-600">{summary.notChecked}</div><div className="text-xs text-slate-500">Not Checked</div></div>
        <div><div className="text-xl font-bold text-red-600">{summary.fail}</div><div className="text-xs text-slate-500">Fail</div></div>
        <div><div className="text-sm font-semibold">{summary.attention}</div><div className="text-xs text-slate-500">Needs attention</div></div>
        <div><div className="text-sm font-semibold">{summary.na}</div><div className="text-xs text-slate-500">N/A</div></div>
        <div><div className="text-sm font-semibold">{summary.missingMeasure}</div><div className="text-xs text-slate-500">Missing measures</div></div>
      </div>
      <div className="card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Blockers ({summary.blockers.length}) — must fix before finalize</h3>
        {summary.blockers.length === 0 ? <p className="text-sm text-slate-600">No blockers — Not Checked items are the only hard blocker.</p> : summary.blockers.map((b, i) => <a key={i} href={b.link} className="block text-sm text-red-700 hover:underline">• {b.reason} → {b.link}</a>)}
      </div>
      <div className="card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Warnings ({summary.warnings.length}) — advisory</h3>
        {summary.warnings.length === 0 ? <p className="text-sm text-slate-600">No warnings.</p> : summary.warnings.map((w, i) => <a key={i} href={w.link} className="block text-sm text-amber-800 hover:underline">• {w.reason} → {w.link}</a>)}
      </div>
      <p className="text-xs text-slate-500">Not Checked ≠ complete — Completeness is recomputed from persisted data. Generating without materials is allowed. Fixing an issue updates this summary.</p>
      <div className="flex gap-2">
        <button onClick={() => router.push(`/assessments/${id}/checklist`)} className="btn-primary text-sm">Go to checklist →</button>
        <button onClick={() => router.push(`/assessments/${id}/report`)} className="btn-secondary text-sm">Report preview →</button>
        <button onClick={() => router.push(`/assessments/${id}`)} className="btn-secondary text-sm">Back to overview</button>
      </div>
    </div>
  );
}
