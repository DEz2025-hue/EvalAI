"use client";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { ChecklistEditor } from "../../../components/ChecklistEditor";
import { ContextForm } from "../../../components/ContextForm";
import { MeasurementsPanel } from "../../../components/MeasurementsPanel";
import { PhotoCapture } from "../../../components/PhotoCapture";
import { VoiceRecorder } from "../../../components/VoiceRecorder";

export default function InspectionDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }) {
  const id = params.id;
  const pack = (searchParams?.pack === "cctv" ? "cctv" : "solar") as "solar" | "cctv";
  const template = PACK_TEMPLATES[pack];
  const items = template.checklist.map((title, i) => ({ id: `tpl-${i}-${title.slice(0, 8)}`, title, required: i < 5, category: i < 2 ? "Site" : "System" }));
  const label = pack === "cctv" ? "CCTV" : "Solar";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inspection · {label} · {id.slice(0, 8)}</h1>
          <p className="text-sm text-slate-600">Mode=inspection · Pack={pack} · Status=draft · RLS workspace-scoped. Report title: Inspection Report. Shares same engine as Assessment.</p>
        </div>
        <div className="flex gap-2">
          <a href={`/inspections/${id}/report?pack=${pack}`} className="btn-primary text-sm">Preview report</a>
          <a href={`/inspections/${id}/materials?pack=${pack}`} className="btn-secondary text-sm">Materials & quotes</a>
        </div>
      </div>

      <ContextForm assessmentId={id} pack={pack} mode="inspection" />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Inspection must not imply certification unless separately authorized — see PRODUCT_REQUIREMENTS.md.</div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Checklist — item-by-item, Not Checked ≠ Pass</h2>
        <p className="text-xs text-slate-500">Template from {label} pack with inspection framing. Each item requires explicit status + evidence where needed. Pass only when checked and evidence supports it.</p>
        <div className="mt-4">
          <ChecklistEditor items={items} assessmentId={id} />
        </div>
      </div>

      <MeasurementsPanel assessmentId={id} />

      <div className="grid gap-4 md:grid-cols-2">
        <PhotoCapture assessmentId={id} onUploaded={(k: string) => console.log(k)} />
        <VoiceRecorder onTranscript={(t: string) => console.log(t)} assessmentId={id} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Defects & corrective actions</h2>
        <p className="text-sm text-slate-600">Inspection findings document defects, severity only when evidence supports it, and corrective actions. Share same findings engine as Assessment.</p>
      </div>
    </div>
  );
}
