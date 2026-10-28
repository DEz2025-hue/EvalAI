import { ReportActions } from "./ReportActions";

export default function ReportPreviewPage({ params }: { params: { id: string } }) {
  const id = params.id;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Report preview · {id.slice(0, 8)}</h1>
        <ReportActions assessmentId={id} />
      </div>
      <div className="card p-6 space-y-4 bg-white">
        <div className="border-b border-slate-200 pb-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">EvalAI — Assessment Report (draft snapshot)</div>
          <div className="text-lg font-semibold">Solar Assessment — Site demo</div>
          <div className="text-xs text-slate-500">Version 1 · 2026-10-28 · Mode: assessment · Pack: solar · Snapshot immutable after finalize</div>
        </div>
        <section>
          <h2 className="text-sm font-semibold">Scope & context</h2>
          <p className="text-sm text-slate-600">Goal, constraints, existing equipment — from saved assessment context. Unknowns remain unknown, not fabricated.</p>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Checklist outcomes</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left">Item</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody><tr><td>Site access & safety</td><td><span className="badge bg-slate-200">Not Checked</span></td><td className="text-xs text-slate-500">≠ Pass</td></tr></tbody>
          </table>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Evidence & measurements</h2>
          <p className="text-sm text-slate-600">Photos via private Storage (signed URLs), voice transcripts (editable, unconfirmed), deterministic calculations (area/volume) — not AI visuals.</p>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Findings & recommendations — drafts until reviewed</h2>
          <p className="text-sm text-slate-600">AI suggestions show assumptions, missingInformation, uncertainty, evidenceReferences. You edit/accept/reject.</p>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Limitations</h2>
          <p className="text-sm text-slate-600">Unresolved items, missing evidence, provisional quantities flagged.</p>
        </section>
        <div className="rounded bg-slate-50 p-3 text-xs text-slate-600">Finalized reports reference exact assessmentVersion/materialsVersion/quotationVersion. Later edits create a new draft, not a silent mutation (SECURITY.md, DATA_MODEL.md).</div>
      </div>
      <p className="text-xs text-slate-500">HTML is deterministic from versioned snapshot. PDF generated server-side via <code>pdf-lib</code> from same snapshot — no AI regeneration at export. Finalize creates immutable <code>report_snapshots</code> row.</p>
    </div>
  );
}
