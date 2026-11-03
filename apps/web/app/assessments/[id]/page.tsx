"use client";
import { useEffect, useState } from "react";
import { scenarioFor, scenarioLabel } from "@eval-ai/shared";
import { ChecklistSummary } from "../../../components/ChecklistSummary";
import type { ItemSource } from "../../../components/SourceBadge";
import { ContextForm } from "../../../components/ContextForm";
import { MeasurementsPanel } from "../../../components/MeasurementsPanel";
import { FieldCapture } from "../../../components/FieldCapture";
import { LiveCameraPanel } from "../../../components/LiveCameraPanel";
import { InterviewPanel } from "../../../components/InterviewPanel";
import { LIVE_CAMERA_ENABLED, type InterviewState } from "@eval-ai/shared";
import { AiDraftPanel } from "../../../components/AiDraftPanel";
import { DeleteJobCard } from "../../../components/DeleteJobCard";
import { CardLoading } from "../../../components/Skeleton";

export default function AssessmentDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }): JSX.Element {
  const id = params.id;
  const [persisted, setPersisted] = useState<{ pack: "solar" | "cctv"; mode: "assessment" | "inspection"; siteName?: string; context?: Record<string, unknown>; checklist?: Array<{ id: string; title: string; required: boolean; source?: ItemSource }>; responses?: Array<{ itemId: string; status: string }> } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const urlPack = (searchParams?.pack === "cctv" ? "cctv" : "solar") as "solar" | "cctv";

  useEffect(() => {
    fetch(`/api/assessments/${id}`).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.pack) throw new Error(data.error ?? "The job couldn't be loaded");
      setPersisted({ pack: data.pack, mode: data.mode, siteName: data.siteName ?? data.context?.siteName ?? data.context?.goal, context: data.context, checklist: data.checklist, responses: data.responses });
    }).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const pack = persisted?.pack ?? urlPack;
  const mode = persisted?.mode ?? "assessment";
  const scenario = scenarioFor(mode, persisted?.context?.scenario);
  // Only the stored items, never template rows with made-up ids: saving those would replace the real checklist.
  const items = persisted?.checklist ?? [];
  const label = pack === "cctv" ? "CCTV" : "Solar";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Assessment &middot; {label} &middot; {id.slice(0, 8)}</h1>
          <p className="text-sm text-slate-600">Mode: {mode} &middot; Pack: {pack} &middot; Situation: {scenarioLabel(scenario)} &middot; Status: draft &middot; {persisted ? persisted.siteName ?? "—" : "Loading…"}</p>
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

      {/* The saved details are put back in the form: saving must never replace them with empty fields. */}
      <ContextForm key={persisted ? "loaded" : "loading"} assessmentId={id} pack={pack} mode={mode as "assessment" | "inspection"} scenario={scenario} initial={{ siteName: typeof persisted?.context?.siteName === "string" ? persisted.context.siteName : persisted?.siteName && persisted.siteName !== persisted?.context?.goal ? persisted.siteName : undefined, goal: typeof persisted?.context?.goal === "string" ? persisted.context.goal : undefined, existingEquipment: typeof persisted?.context?.existingEquipment === "string" ? persisted.context.existingEquipment : undefined, constraints: typeof persisted?.context?.constraints === "string" ? persisted.context.constraints : undefined }} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Checklist &middot; Not Checked &ne; Pass</h2>
        <p className="mt-1 text-xs text-slate-500">Based on the {label} template. Open an item to check it; use the <a href={`/assessments/${id}/checklist-builder`} className="underline">checklist builder</a> to add, remove or reorder items.</p>
        <div className="mt-4">
          {loadError ? (
            <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{loadError} — reload the page to see the checklist.</div>
          ) : !persisted ? (
            <CardLoading label="Loading checklist…" lines={4} />
          ) : items.length === 0 ? (
            <a href={`/assessments/${id}/checklist-builder`} className="btn-secondary text-xs">Open the checklist builder</a>
          ) : (
            <ChecklistSummary items={items} responses={persisted.responses ?? []} walkthroughHref={`/assessments/${id}/checklist`} />
          )}
        </div>
      </div>

      <MeasurementsPanel assessmentId={id} />

      <FieldCapture assessmentId={id} basePath="/assessments" />

      {persisted ? <InterviewPanel key="interview" assessmentId={id} items={items.map((i) => ({ id: i.id, title: i.title }))} initial={(persisted.context?.interview as InterviewState | undefined) ?? null} /> : null}

      {/* Live guidance is off for now (D-038); it is coming with Meta glasses. */}
      {LIVE_CAMERA_ENABLED ? <LiveCameraPanel assessmentId={id} /> : null}

      <AiDraftPanel assessmentId={id} pack={pack} mode={mode as "assessment" | "inspection"} />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Report — versioned and shareable</h2>
        <p className="mt-1 text-sm text-slate-600">Generate a report from your saved facts and validated drafts. When you finalise it, that version is preserved — later edits create a new version.</p>
        <a href={`/assessments/${id}/report`} className="mt-3 inline-flex btn-secondary text-xs">Open HTML preview</a>
      </div>

      {persisted && <DeleteJobCard assessmentId={id} siteName={persisted.siteName ?? ""} backHref="/assessments" />}

    </div>
  );
}
