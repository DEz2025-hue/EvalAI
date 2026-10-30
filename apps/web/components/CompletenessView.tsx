"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CompletenessResult, CompletenessTarget } from "@eval-ai/shared";

type Base = "/assessments" | "/inspections";

const TARGET_PATH: Record<CompletenessTarget, string> = {
  checklist: "checklist",
  findings: "findings",
  materials: "materials",
  clarify: "clarify",
  evidence: "evidence",
};

/** Server-computed completeness review shared by Assessments and Inspections. */
export function CompletenessView({ id, basePath }: { id: string; basePath: Base }): JSX.Element {
  const [data, setData] = useState<CompletenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/completeness?assessmentId=${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not compute completeness");
        return d as CompletenessResult;
      })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id]);

  const href = (t: CompletenessTarget) => `${basePath}/${id}/${TARGET_PATH[t]}`;

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Computing completeness…</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Completeness review</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)}</span>
      </div>
      {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {data ? (
        <>
          <div className={`rounded-lg border px-3 py-2 text-sm ${data.ready ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {data.ready ? "Ready to finalize — no blocking issues. Review the warnings below before you do." : `${data.blockers.length} blocking issue(s) must be fixed before this can be finalized.`}
          </div>
          <div className="card p-4 grid grid-cols-3 gap-2 text-center">
            <div><div className="text-xl font-bold">{data.counts.pass}</div><div className="text-xs text-slate-500">Pass</div></div>
            <div><div className="text-xl font-bold text-amber-600">{data.counts.not_checked}</div><div className="text-xs text-slate-500">Not Checked</div></div>
            <div><div className="text-xl font-bold text-red-600">{data.counts.fail}</div><div className="text-xs text-slate-500">Fail</div></div>
            <div><div className="text-sm font-semibold">{data.counts.needs_attention}</div><div className="text-xs text-slate-500">Needs attention</div></div>
            <div><div className="text-sm font-semibold">{data.counts.not_applicable}</div><div className="text-xs text-slate-500">N/A</div></div>
            <div><div className="text-sm font-semibold">{data.total}</div><div className="text-xs text-slate-500">Items</div></div>
          </div>
          <div className="card p-4 space-y-2">
            <h3 className="font-semibold text-sm">Blockers ({data.blockers.length}) — must be fixed before finalize</h3>
            {data.blockers.length === 0 ? <p className="text-sm text-slate-600">No blockers.</p> : data.blockers.map((b, i) => <Link key={i} href={href(b.target) as never} className="block text-sm text-red-700 hover:underline">• {b.reason} →</Link>)}
          </div>
          <div className="card p-4 space-y-2">
            <h3 className="font-semibold text-sm">Warnings ({data.warnings.length}) — advisory, shown in the report&apos;s limitations</h3>
            {data.warnings.length === 0 ? <p className="text-sm text-slate-600">No warnings.</p> : data.warnings.map((w, i) => <Link key={i} href={href(w.target) as never} className="block text-sm text-amber-800 hover:underline">• {w.reason} →</Link>)}
          </div>
        </>
      ) : null}
      <p className="text-xs text-slate-500">Not Checked is never treated as Pass. This review is recomputed from saved data every time, and the same rules are enforced when you finalize a report.</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`${basePath}/${id}/checklist` as never} className="btn-primary text-sm">Go to checklist →</Link>
        <Link href={`${basePath}/${id}/report` as never} className="btn-secondary text-sm">Report →</Link>
        <Link href={`${basePath}/${id}` as never} className="btn-secondary text-sm">Back to overview</Link>
      </div>
    </div>
  );
}
