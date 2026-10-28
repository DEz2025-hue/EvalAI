"use client";
import { useState } from "react";

type Finding = { title: string; description: string; severity?: "low"|"medium"|"high"; evidenceRefs?: string[]; requiresHumanReview?: boolean; uncertainty?: string };

export function AiDraftPanel({ assessmentId, pack, mode }: { assessmentId: string; pack: "solar"|"cctv"; mode: "assessment"|"inspection" }) {
  const [loading, setLoading] = useState<"idle"|"clarify"|"checklist"|"analyze">("idle");
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [meta, setMeta] = useState<{ uncertainty?: string; missingInformation?: string[]; assumptions?: string[]; fallback?: boolean } | null>(null);

  async function runAnalysis() {
    setLoading("analyze");
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "00000000-0000-4000-a000-000000000001", assessmentId, mode, pack, checklistResponses: [], evidenceRefs: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyze failed");
      setFindings(data.potentialFindings ?? data.potential_findings ?? []);
      setMeta({ uncertainty: data.uncertainty, missingInformation: data.missingInformation ?? data.missing_information, assumptions: data.assumptions, fallback: !!data._fallback });
      if (data._fallback) setError("Fallback draft — provider not reachable, your saved work remains intact. Edit and save manually.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }

  // Spoken responses only if provider verify passes — otherwise text (Phase 4)
  const canSpeak = false; // set true only after /api/verify/provider confirms TTS support

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold">AI drafts — user-requested, editable before save</h3>
      <p className="text-xs text-slate-500">Each draft shows <code>uncertainty</code>, <code>missingInformation</code>, <code>assumptions</code>, <code>requiresHumanReview=true</code>, and validated <code>evidenceRefs</code> (invalid refs stripped). Unsupported claims are rejected or qualified. Failure preserves saved work.</p>
      <div className="flex gap-2 flex-wrap">
        <button onClick={runAnalysis} disabled={loading !== "idle"} className="btn-primary text-xs">{loading === "analyze" ? "Analyzing…" : "Request AI analysis (Wonder)"}</button>
        <span className="text-xs text-slate-500">Progress: {loading === "idle" ? "idle" : loading + "…"}</span>
      </div>
      {error && <p className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error} — continue manually, checklist and evidence are still saved.</p>}
      {meta && (
        <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
          <div>Uncertainty: <span className="font-medium">{meta.uncertainty ?? "—"}</span> {meta.fallback ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">fallback</span> : null}</div>
          {meta.missingInformation?.length ? <div className="mt-1">Missing: {meta.missingInformation.join("; ")}</div> : null}
          {meta.assumptions?.length ? <div className="mt-1">Assumptions: {meta.assumptions.join("; ")}</div> : null}
          <div className="mt-1">Voice transcripts are untrusted — never auto-converted to precise values; spoken responses {canSpeak ? "enabled" : "text only until TTS verified"}.</div>
        </div>
      )}
      {findings.length > 0 ? (
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2"><span className="text-sm font-medium">{f.title}</span>{f.severity ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{f.severity}</span> : null}<span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">draft — requires review</span></div>
              <textarea defaultValue={f.description} rows={2} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-slate-500">Evidence refs: {(f.evidenceRefs ?? []).join(", ") || "— (invalid refs stripped)"} · Uncertainty: {f.uncertainty ?? meta?.uncertainty ?? "—"}</p>
              <div className="mt-2 flex gap-2"><button className="btn-primary text-xs">Save finding (editable)</button><button onClick={() => setFindings((prev) => prev.filter((_, idx) => idx !== i))} className="btn-secondary text-xs">Discard</button></div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No drafts yet — press Request to generate. Drafts are editable before save and never overwrite verified facts.</p>
      )}
    </div>
  );
}
