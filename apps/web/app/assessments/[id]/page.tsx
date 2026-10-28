"use client";
import { useEffect, useState } from "react";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { ChecklistEditor } from "../../../components/ChecklistEditor";
import { ContextForm } from "../../../components/ContextForm";
import { MeasurementsPanel } from "../../../components/MeasurementsPanel";
import { PhotoCapture } from "../../../components/PhotoCapture";
import { VoiceRecorder } from "../../../components/VoiceRecorder";
import { AiDraftPanel } from "../../../components/AiDraftPanel";

export default function AssessmentDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }) {
  const id = params.id;
  const [persisted, setPersisted] = useState<{ pack: "solar" | "cctv"; mode: "assessment" | "inspection"; siteName?: string } | null>(null);
  const urlPack = (searchParams?.pack === "cctv" ? "cctv" : "solar") as "solar" | "cctv";

  useEffect(() => {
    fetch(`/api/assessments/${id}`).then((r) => r.json()).then((data) => {
      if (data.pack) setPersisted({ pack: data.pack, mode: data.mode, siteName: data.siteName ?? data.context?.goal });
    }).catch(() => {});
  }, [id]);

  const pack = persisted?.pack ?? urlPack;
  const mode = persisted?.mode ?? "assessment";
  const template = PACK_TEMPLATES[pack];
  const items = template.checklist.map((title, i) => ({ id: `${id}_item_${i}`, title, required: i < 5, category: i < 2 ? "Site" : "System" }));
  const label = pack === "cctv" ? "CCTV" : "Solar";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Assessment · {label} · {id.slice(0, 8)}</h1>
          <p className="text-sm text-slate-600">Mode={mode} · Pack={pack} · Status=draft · {persisted ? `Persisted: ${persisted.siteName ?? "—"}` : "Loading persisted data or using URL fallback"} · RLS when workspaceId set. Same engine, different template.</p>
        </div>
        <div className="flex gap-2">
          <a href={`/assessments/${id}/report`} className="btn-primary text-sm">Preview report</a>
          <a href={`/assessments/${id}/materials`} className="btn-secondary text-sm">Materials & quotes</a>
        </div>
      </div>

      <ContextForm assessmentId={id} pack={pack} mode={mode as "assessment" | "inspection"} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Checklist — editable · Not Checked ≠ Pass</h2>
        <p className="mt-1 text-xs text-slate-500">Template from <code>solar</code> pack; AI can propose edits via <code>/api/ai/checklist</code> (Spark) — you review, add/remove/reorder, then confirm. Required items warned before removal.</p>
        <div className="mt-4">
          <ChecklistEditor items={items} assessmentId={id} />
        </div>
      </div>

      <MeasurementsPanel assessmentId={id} />

      <div className="grid gap-4 md:grid-cols-2">
        <PhotoCapture assessmentId={id} onUploaded={(k) => console.log("evidence key", k)} />
        <VoiceRecorder onTranscript={(t) => console.log("voice transcript", t)} assessmentId={id} />
      </div>

      <AiDraftPanel assessmentId={id} pack={pack} mode={mode as "assessment" | "inspection"} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Report — versioned snapshot + PDF/HTML</h2>
        <p className="mt-1 text-sm text-slate-600">Generate from stored facts + validated drafts. Finalize creates immutable <code>report_snapshots</code> row (assessmentVersion, materialsVersion, quotationVersion). Later edits do not mutate finalized reports.</p>
        <a href={`/assessments/${id}/report`} className="mt-3 inline-flex btn-secondary text-xs">Open HTML preview</a>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Coming Soon (not a working feature): continuous live-camera AI guidance — labelled as such until provider/streaming/privacy/latency validated.</div>
    </div>
  );
}
