"use client";

export function ReportPreview({ assessmentId, mode = "assessment", pack = "solar", items = [] as Array<{ title: string; status: string }> }: { assessmentId: string; mode?: "assessment" | "inspection"; pack?: "solar" | "cctv"; items?: Array<{ title: string; status: string }> }) {
  return (
    <div className="card p-0 overflow-hidden bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">EvalAI — {mode} report · {pack}</div>
          <div className="text-sm font-semibold">Snapshot preview · {assessmentId.slice(0, 8)}</div>
        </div>
        <button onClick={() => window.print()} className="btn-primary text-xs">Print / Save PDF</button>
      </div>
      <div className="p-6 space-y-4 text-sm">
        <p className="text-slate-600">HTML preview from versioned snapshot. Finalized snapshots are immutable — later edits create new versions.</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="text-left">Item</th><th>Status</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={2} className="py-6 text-center text-slate-500">No checklist data — complete assessment first. Not Checked ≠ Pass.</td></tr> : items.map((it) => <tr key={it.title} className="border-t border-slate-100"><td>{it.title}</td><td><span className="badge bg-slate-100">{it.status}</span></td></tr>)}
          </tbody>
        </table>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">Limitations & assumptions rendered here. AI drafts labelled “requires human review”.</div>
      </div>
    </div>
  );
}
