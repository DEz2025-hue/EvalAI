"use client";
import { useEffect, useState } from "react";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { ChecklistEditor } from "../../../components/ChecklistEditor";
import { ContextForm } from "../../../components/ContextForm";
import { MeasurementsPanel } from "../../../components/MeasurementsPanel";
import { FieldCapture } from "../../../components/FieldCapture";
import { LiveCameraPanel } from "../../../components/LiveCameraPanel";
import { AiDraftPanel } from "../../../components/AiDraftPanel";

export default function InspectionDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }): JSX.Element {
  const id = params.id;
  const [persisted, setPersisted] = useState<{ pack: "solar" | "cctv"; mode: "assessment" | "inspection"; siteName?: string; checklist?: Array<{ id: string; title: string; instructions?: string; required: boolean; category?: string }> } | null>(null);
  const urlPack = (searchParams?.pack === "cctv" ? "cctv" : "solar") as "solar" | "cctv";

  useEffect(() => {
    fetch(`/api/assessments/${id}`).then((r) => r.json()).then((data) => {
      if (data.pack) setPersisted({ pack: data.pack, mode: data.mode, siteName: data.siteName ?? data.context?.siteName ?? data.context?.goal, checklist: data.checklist });
    }).catch(() => {});
  }, [id]);

  const pack = persisted?.pack ?? urlPack;
  const template = PACK_TEMPLATES[pack];
  // Stored items first (builder edits included); template only before the fetch resolves.
  const items = persisted?.checklist?.length
    ? persisted.checklist
    : template.checklist.map((title, i) => ({ id: `${id}_item_${i}`, title, required: i < 5, category: i < 2 ? "Site" : "System" }));
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

      <div className="flex flex-wrap gap-2 text-xs">
        <a href={`/inspections/${id}/clarify`} className="btn-secondary text-xs">Clarify</a>
        <a href={`/inspections/${id}/checklist-builder`} className="btn-secondary text-xs">Checklist builder</a>
        <a href={`/inspections/${id}/checklist`} className="btn-secondary text-xs">Checklist walkthrough</a>
        <a href={`/inspections/${id}/evidence`} className="btn-secondary text-xs">Evidence gallery</a>
        <a href={`/inspections/${id}/completeness`} className="btn-secondary text-xs">Completeness</a>
      </div>

      <ContextForm assessmentId={id} pack={pack} mode="inspection" />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Inspection must not imply certification unless separately authorized.</div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Checklist — item-by-item, Not Checked ≠ Pass</h2>
        <p className="text-xs text-slate-500">Stored items from {label} pack with inspection framing. Each item requires explicit status + evidence where needed. Pass only when checked and evidence supports it.</p>
        <div className="mt-4">
          <ChecklistEditor items={items} assessmentId={id} />
        </div>
      </div>

      <MeasurementsPanel assessmentId={id} />

      <FieldCapture assessmentId={id} basePath="/inspections" />

      <LiveCameraPanel assessmentId={id} />

      <AiDraftPanel assessmentId={id} pack={pack} mode="inspection" />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Defects & corrective actions</h2>
        <p className="text-sm text-slate-600">Inspection findings document defects, severity only when evidence supports it, and corrective actions. Review and confirm them on the findings page.</p>
        <a href={`/inspections/${id}/findings`} className="mt-3 inline-flex btn-secondary text-xs">Review findings →</a>
      </div>
    </div>
  );
}
