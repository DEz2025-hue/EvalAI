"use client";
import { useEffect, useState } from "react";
import { ReportActions } from "../../../assessments/[id]/report/ReportActions";

type Snap = { id: string; assessmentId: string; assessmentVersion: number; checklistVersion: string; materialsVersion: number | null; finalized: boolean; createdAt: string; htmlPreview?: string };

export default function InspectionReportPage({ params }: { params: { id: string } }): JSX.Element {
  const id = params.id;
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [html, setHtml] = useState("");
  useEffect(() => {
    fetch(`/api/reports/snapshot?assessmentId=${id}`).then((r) => r.json()).then((d) => {
      setSnaps(d.snapshots ?? []);
      if (d.snapshots?.[0]?.htmlPreview) setHtml(d.snapshots[0].htmlPreview);
    }).catch(() => {});
  }, [id]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Inspection Report · {id.slice(0, 8)}</h1>
        <ReportActions assessmentId={id} />
      </div>
      <div className="card p-4 text-xs text-slate-600">Inspection report — same versioned snapshot engine as Assessment, distinct title. Must not imply certification. Later edits create new versions.</div>
      {snaps.length > 0 && (
        <div className="card p-3 text-xs">
          <div className="font-medium">Snapshots</div>
          <ul className="mt-1 space-y-1">{snaps.map((s) => <li key={s.id} className="flex justify-between bg-slate-50 px-2 py-1 rounded"><span>{s.id.slice(0,12)} · v{s.assessmentVersion}{s.materialsVersion ? ` · mats v${s.materialsVersion}` : ""}</span><span className={s.finalized ? "text-green-700" : "text-amber-700"}>{s.finalized ? "finalized" : "draft"}</span></li>)}</ul>
        </div>
      )}
      {html && <div className="card p-0 overflow-hidden bg-white"><div className="p-4" dangerouslySetInnerHTML={{ __html: html }} /></div>}
      <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">Not Checked ≠ Pass. Severity only when evidence supports it. Finalized snapshots immutable — exit gate.</div>
    </div>
  );
}
