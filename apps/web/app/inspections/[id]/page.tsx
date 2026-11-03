"use client";
import { useEffect, useState } from "react";
import { ChecklistSummary } from "../../../components/ChecklistSummary";
import type { ItemSource } from "../../../components/SourceBadge";
import { ContextForm } from "../../../components/ContextForm";
import { MeasurementsPanel } from "../../../components/MeasurementsPanel";
import { FieldCapture } from "../../../components/FieldCapture";
import { LiveCameraPanel } from "../../../components/LiveCameraPanel";
import { InterviewPanel } from "../../../components/InterviewPanel";
import type { InterviewState } from "@eval-ai/shared";
import { AiDraftPanel } from "../../../components/AiDraftPanel";
import { DeleteJobCard } from "../../../components/DeleteJobCard";
import { CardLoading } from "../../../components/Skeleton";

export default function InspectionDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { pack?: string } }): JSX.Element {
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
  // Only the stored items, never template rows with made-up ids: saving those would replace the real checklist.
  const items = persisted?.checklist ?? [];
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

      {/* The saved details are put back in the form: saving must never replace them with empty fields. */}
      <ContextForm key={persisted ? "loaded" : "loading"} assessmentId={id} pack={pack} mode="inspection" initial={{ siteName: typeof persisted?.context?.siteName === "string" ? persisted.context.siteName : persisted?.siteName && persisted.siteName !== persisted?.context?.goal ? persisted.siteName : undefined, goal: typeof persisted?.context?.goal === "string" ? persisted.context.goal : undefined, existingEquipment: typeof persisted?.context?.existingEquipment === "string" ? persisted.context.existingEquipment : undefined, constraints: typeof persisted?.context?.constraints === "string" ? persisted.context.constraints : undefined }} />
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Inspection must not imply certification unless separately authorized.</div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Checklist — item-by-item, Not Checked ≠ Pass</h2>
        <p className="text-xs text-slate-500">Stored items from {label} pack with inspection framing. Each item requires explicit status + evidence where needed. Pass only when checked and evidence supports it.</p>
        <div className="mt-4">
          {loadError ? (
            <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{loadError} — reload the page to see the checklist.</div>
          ) : !persisted ? (
            <CardLoading label="Loading checklist…" lines={4} />
          ) : items.length === 0 ? (
            <a href={`/inspections/${id}/checklist-builder`} className="btn-secondary text-xs">Open the checklist builder</a>
          ) : (
            <ChecklistSummary items={items} responses={persisted.responses ?? []} walkthroughHref={`/inspections/${id}/checklist`} />
          )}
        </div>
      </div>

      <MeasurementsPanel assessmentId={id} />

      <FieldCapture assessmentId={id} basePath="/inspections" />

      {persisted ? <InterviewPanel key="interview" assessmentId={id} items={items.map((i) => ({ id: i.id, title: i.title }))} initial={(persisted.context?.interview as InterviewState | undefined) ?? null} /> : null}

      <LiveCameraPanel assessmentId={id} />

      <AiDraftPanel assessmentId={id} pack={pack} mode="inspection" />

      <div className="card p-4">
        <h2 className="text-sm font-semibold">Defects & corrective actions</h2>
        <p className="text-sm text-slate-600">Inspection findings document defects, severity only when evidence supports it, and corrective actions. Review and confirm them on the findings page.</p>
        <a href={`/inspections/${id}/findings`} className="mt-3 inline-flex btn-secondary text-xs">Review findings →</a>
      </div>

      {persisted && <DeleteJobCard assessmentId={id} siteName={persisted.siteName ?? ""} backHref="/inspections" />}
    </div>
  );
}
