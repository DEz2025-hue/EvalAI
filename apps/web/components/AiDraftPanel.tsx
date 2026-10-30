"use client";
import { useState } from "react";

type Finding = { title: string; description: string; severity?: "low"|"medium"|"high"; evidenceRefs?: string[]; requiresHumanReview?: boolean; uncertainty?: string; savedId?: string };

export function AiDraftPanel({ assessmentId, pack, mode }: { assessmentId: string; pack: "solar"|"cctv"; mode: "assessment"|"inspection" }): JSX.Element {
  const [loading, setLoading] = useState<"idle"|"clarify"|"checklist"|"analyze">("idle");
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [draftText, setDraftText] = useState<Record<number, string>>({});
  const [meta, setMeta] = useState<{ uncertainty?: string; missingInformation?: string[]; assumptions?: string[]; fallback?: boolean } | null>(null);

  async function runAnalysis() {
    setLoading("analyze");
    setError(null);
    try {
      // Analyze the ACTUAL saved field data — never empty placeholders.
      const [respRes, evRes] = await Promise.all([
        fetch(`/api/checklist/responses?assessmentId=${assessmentId}`).then((r) => (r.ok ? r.json() : { responses: [] })).catch(() => ({ responses: [] })),
        fetch(`/api/evidence/upload?assessmentId=${assessmentId}`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      ]);
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, mode, pack, checklistResponses: (respRes as { responses?: unknown[] }).responses ?? [], evidenceRefs: ((evRes as { items?: Array<{ storage_key: string }> }).items ?? []).map((e) => e.storage_key) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyze failed");
      setFindings((data.potentialFindings ?? data.potential_findings ?? []).map((f: Finding) => ({ ...f, savedId: undefined as string | undefined })));
      setMeta({ uncertainty: data.uncertainty, missingInformation: data.missingInformation ?? data.missing_information, assumptions: data.assumptions, fallback: !!data._fallback });
      if (data._fallback) setError("Draft created from fallback — your saved work is intact. Review and edit before saving.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }

  async function saveFinding(idx: number) {
    const f = findings[idx];
    const text = draftText[idx] ?? f.description ?? "";
    setError(null);
    try {
      const res = await fetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, title: f.title, description: text, severity: f.severity, evidenceRefs: f.evidenceRefs ?? [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not save finding");
      setFindings((prev) => prev.map((p, i) => (i === idx ? { ...p, savedId: (data as { finding?: { id?: string } }).finding?.id } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const canSpeak = false;

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold">AI drafts — on request, editable before you save</h3>
      <p className="text-xs text-slate-500">Each draft is editable before you save it. Review the suggestions, check what&apos;s missing, and keep only what you confirm.</p>
      <div className="flex gap-2 flex-wrap">
        <button onClick={runAnalysis} disabled={loading !== "idle"} className="btn-primary text-xs">{loading === "analyze" ? "Analyzing…" : "Request AI analysis"}</button>
        <span className="text-xs text-slate-500">Status: {loading === "idle" ? "idle" : loading + "…"}</span>
      </div>
      {error && <p className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error} — your checklist and evidence are still saved.</p>}
      {meta && (
        <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
          <div>Confidence: <span className="font-medium">{meta.uncertainty ?? "—"}</span> {meta.fallback ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">fallback</span> : null}</div>
          {meta.missingInformation?.length ? <div className="mt-1">Missing: {meta.missingInformation.join("; ")}</div> : null}
          {meta.assumptions?.length ? <div className="mt-1">Assumptions: {meta.assumptions.join("; ")}</div> : null}
          <div className="mt-1">Voice transcripts are saved as notes — confirm any numbers or units before using them.</div>
        </div>
      )}
      {findings.length > 0 ? (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2"><span className="text-sm font-medium">{f.title}</span>{f.severity ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{f.severity}</span> : null}<span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{f.savedId ? "saved · needs review" : "draft — needs review"}</span></div>
              <textarea value={draftText[i] ?? f.description ?? ""} onChange={(e) => setDraftText((prev) => ({ ...prev, [i]: e.target.value }))} rows={2} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-slate-500">Uncertainty: {f.uncertainty ?? meta?.uncertainty ?? "—"}</p>
              <div className="mt-2 flex gap-2"><button onClick={() => saveFinding(i)} disabled={!!f.savedId} className="btn-primary text-xs">{f.savedId ? "Saved ✓" : "Save finding"}</button><button onClick={() => setFindings((prev) => prev.filter((_, idx) => idx !== i))} className="btn-secondary text-xs">Discard</button></div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No drafts yet — request an analysis when you&apos;re ready. Drafts are editable before save and never overwrite your verified facts.</p>
      )}
    </div>
  );
}
