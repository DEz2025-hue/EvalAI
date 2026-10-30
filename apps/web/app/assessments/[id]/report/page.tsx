"use client";
import { useEffect, useState } from "react";
import { ReportActions } from "./ReportActions";

type Snapshot = {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  checklistVersion: string;
  materialsVersion: number | null;
  quotationVersion: number | null;
  finalized: boolean;
  createdAt: string;
  htmlPreview?: string;
};

export default function ReportPreviewPage({ params }: { params: { id: string } }): JSX.Element {
  const id = params.id;
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports/snapshot?assessmentId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        setSnapshots(data.snapshots ?? []);
        if (data.snapshots?.[0]?.htmlPreview) setHtml(data.snapshots[0].htmlPreview);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Report preview · {id.slice(0, 8)}</h1>
        <ReportActions assessmentId={id} />
      </div>

      {loading && <div className="card p-6 text-sm text-slate-500">Loading snapshots from stored facts…</div>}
      {error && <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error} — you can still generate a draft below. Snapshot creation does not lose saved assessment.</div>}

      {snapshots.length > 0 ? (
        <div className="card p-3">
          <div className="text-xs font-medium text-slate-700">Versioned snapshots — immutable after finalize</div>
          <ul className="mt-2 space-y-1 text-xs">
            {snapshots.slice().reverse().map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                <span><code>{s.id.slice(0, 12)}</code> · v{s.assessmentVersion} · checklist {s.checklistVersion}{s.materialsVersion ? ` · materials v${s.materialsVersion}` : " · no materials"}{s.quotationVersion ? ` · quote v${s.quotationVersion}` : ""} · {new Date(s.createdAt).toLocaleString()}</span>
                <span className={`rounded px-1.5 py-0.5 ${s.finalized ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{s.finalized ? "finalized (immutable)" : "draft"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Later edits create new snapshots — existing finalized reports never mutate (exit gate). Transient PDF/storage errors do not lose snapshot.</p>
        </div>
      ) : (
        !loading && <div className="card p-6 text-center text-sm text-slate-500">No snapshots yet — generate one with <strong>Download PDF</strong> (without or with materials) or <strong>Finalize</strong>. First snapshot will pin assessmentVersion/materialsVersion/quotationVersion.</div>
      )}

      {html ? (
        <div className="card p-0 overflow-hidden bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium">Deterministic HTML preview — from versioned snapshot payload (no AI regeneration at export)</div>
          <div className="p-4" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : (
        <div className="card p-6 space-y-4 bg-white">
          <div className="border-b border-slate-200 pb-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">EvalAI — Assessment Report (will be assembled from saved facts)</div>
            <div className="text-sm text-slate-600">Site, mode, pack, scope, checklist outcomes, measurements, optional materials/quotations, limitations — all from stored facts. Provisional quantities flagged. No prices invented.</div>
          </div>
          <p className="text-xs text-slate-500">Checklist: <code>Not Checked ≠ Pass</code>. Evidence via private Storage signed URLs only after authorization. Limitations & assumptions preserved.</p>
        </div>
      )}

      <p className="text-xs text-slate-500">HTML is deterministic from versioned snapshot payload. PDF generated server-side via <code>pdf-lib</code> from same snapshot. Finalize creates immutable <code>report_snapshots</code> row (trigger blocks mutation). Generate without materials for a report without a materials list (TEST_PLAN #34).</p>
    </div>
  );
}
