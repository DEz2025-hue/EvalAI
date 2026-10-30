"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Snap = { id: string; assessmentId: string; assessmentVersion: number; checklistVersion: string; materialsVersion: number | null; finalized: boolean; createdAt: string };

export default function ReportsPage(): JSX.Element {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/reports/snapshot")
      .then((r) => r.json())
      .then((d) => setSnaps(d.snapshots ?? []))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reports</h1>
      <div className="card p-4 text-xs text-slate-600">PDF and HTML reports are built from versioned snapshots. When you finalise a report it becomes immutable — later edits create a new version.</div>
      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">Loading reports…</div>
      ) : snaps.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No reports yet — open an assessment or inspection and generate a report preview, then finalise.</div>
      ) : (
        <div className="space-y-2">
          {snaps.map((s) => (
            <div key={s.id} className="card flex items-center justify-between p-3">
              <div className="text-sm"><Link href={`/assessments/${s.assessmentId}/report`} className="font-medium text-sky-700 hover:underline">{s.id.slice(0, 12)} · {s.assessmentId.slice(0, 8)}</Link> <span className="text-xs text-slate-500">· v{s.assessmentVersion} · {s.checklistVersion}{s.materialsVersion ? ` · materials v${s.materialsVersion}` : " · without materials"} · {new Date(s.createdAt).toLocaleString()}</span></div>
              <span className={`rounded px-2 py-0.5 text-xs ${s.finalized ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{s.finalized ? "finalized" : "draft"}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Finalised reports stay unchanged even if you keep editing the assessment. If an export fails, you can retry from the report preview.</p>
    </div>
  );
}
