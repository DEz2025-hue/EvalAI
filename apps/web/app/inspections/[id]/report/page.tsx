import { ReportActions } from "../../../assessments/[id]/report/ReportActions";

export default function InspectionReportPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }) {
  const id = params.id;
  const pack = searchParams?.pack === "cctv" ? "CCTV" : "Solar";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inspection Report · {pack} · {id.slice(0, 8)}</h1>
        <ReportActions assessmentId={id} />
      </div>
      <div className="card p-6 space-y-4 bg-white">
        <div className="border-b border-slate-200 pb-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">EvalAI — Inspection Report (draft snapshot)</div>
          <div className="text-xs text-slate-500">Mode: inspection · Pack: {pack} · Snapshot immutable after finalize · Must not imply certification</div>
        </div>
        <p className="text-sm text-slate-600">Inspection report shares same snapshot engine as Assessment — distinct title, same versioning, later edits create new versions.</p>
        <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">Not Checked ≠ Pass. Pass requires actual check + supporting evidence. Defect severity only when evidence supports it.</div>
      </div>
    </div>
  );
}
