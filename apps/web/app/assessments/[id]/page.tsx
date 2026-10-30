"use client";
import { useEffect, useState } from "react";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { ChecklistEditor } from "../../../components/ChecklistEditor";
import { ContextForm } from "../../../components/ContextForm";
import { MeasurementsPanel } from "../../../components/MeasurementsPanel";
import { PhotoCapture } from "../../../components/PhotoCapture";
import { VoiceRecorder } from "../../../components/VoiceRecorder";
import { LiveCameraPanel } from "../../../components/LiveCameraPanel";
import { AiDraftPanel } from "../../../components/AiDraftPanel";

export default function AssessmentDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }): JSX.Element {
  const id = params.id;
  const [persisted, setPersisted] = useState<{ pack: "solar" | "cctv"; mode: "assessment" | "inspection"; siteName?: string; checklist?: Array<{ id: string; title: string; instructions?: string; required: boolean; category?: string }> } | null>(null);
  const urlPack = (searchParams?.pack === "cctv" ? "cctv" : "solar") as "solar" | "cctv";

  useEffect(() => {
    fetch(`/api/assessments/${id}`).then((r) => r.json()).then((data) => {
      if (data.pack) setPersisted({ pack: data.pack, mode: data.mode, siteName: data.siteName ?? data.context?.siteName ?? data.context?.goal, checklist: data.checklist });
    }).catch(() => {});
  }, [id]);

  const pack = persisted?.pack ?? urlPack;
  const mode = persisted?.mode ?? "assessment";
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
          <h1 className="text-xl font-semibold">Assessment &middot; {label} &middot; {id.slice(0, 8)}</h1>
          <p className="text-sm text-slate-600">Mode: {mode} &middot; Pack: {pack} &middot; Status: draft &middot; {persisted ? persisted.siteName ?? "—" : "Loading…"}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/assessments/${id}/report`} className="btn-primary text-sm">Preview report</a>
          <a href={`/assessments/${id}/findings`} className="btn-secondary text-sm">Findings</a>
          <a href={`/assessments/${id}/materials`} className="btn-secondary text-sm">Materials & quotes</a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <a href={`/assessments/${id}/clarify`} className="btn-secondary text-xs">Clarify</a>
        <a href={`/assessments/${id}/checklist-builder`} className="btn-secondary text-xs">Checklist builder</a>
        <a href={`/assessments/${id}/checklist`} className="btn-secondary text-xs">Checklist walkthrough</a>
        <a href={`/assessments/${id}/evidence`} className="btn-secondary text-xs">Evidence gallery</a>
        <a href={`/assessments/${id}/completeness`} className="btn-secondary text-xs">Completeness</a>
        <a href={`/assessments/${id}/findings`} className="btn-secondary text-xs">Findings</a>
      </div>

      <ContextForm assessmentId={id} pack={pack} mode={mode as "assessment" | "inspection"} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Checklist — editable &middot; Not Checked &ne; Pass</h2>
        <p className="mt-1 text-xs text-slate-500">Your checklist is based on the {label} template. You can add, remove, or reorder items before you confirm.</p>
        <div className="mt-4">
          <ChecklistEditor items={items} assessmentId={id} />
        </div>
      </div>

      <MeasurementsPanel assessmentId={id} />

      <div className="grid gap-4 md:grid-cols-2">
        <PhotoCapture assessmentId={id} onUploaded={(k) => console.log("evidence key", k)} />
        <VoiceRecorder onTranscript={(t) => console.log("voice transcript", t)} assessmentId={id} />
      </div>

      <LiveCameraPanel assessmentId={id} />

      <AiDraftPanel assessmentId={id} pack={pack} mode={mode as "assessment" | "inspection"} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Report — versioned and shareable</h2>
        <p className="mt-1 text-sm text-slate-600">Generate a report from your saved facts and validated drafts. When you finalise it, that version is preserved — later edits create a new version.</p>
        <a href={`/assessments/${id}/report`} className="mt-3 inline-flex btn-secondary text-xs">Open HTML preview</a>
      </div>

      <div className="rounded-lg border border-slate-200 bg-amber-50 p-3 text-xs text-amber-900">Live Camera Analysis — Coming Soon. Not available in this release. Use photo capture and on-demand analysis instead.</div>
    </div>
  );
}
