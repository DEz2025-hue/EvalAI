"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRole } from "./useRole";

type Narrative = { summary?: string; recommendations?: string; notes?: string };
type Snapshot = {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  checklistVersion: string;
  materialsVersion: number | null;
  quotationVersion: number | null;
  finalized: boolean;
  createdAt: string;
  htmlPreview?: string;
  payload?: { narrative?: Narrative };
  reviewedByLabel?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

const SECTIONS: Array<{ key: keyof Narrative; label: string; hint: string }> = [
  { key: "summary", label: "Summary", hint: "A short plain-language overview of what was assessed and what was found." },
  { key: "recommendations", label: "Recommendations", hint: "What should happen next, in your words. AI drafts are only suggestions — write what you stand behind." },
  { key: "notes", label: "Reviewer notes", hint: "Anything the reader should know about scope, access or caveats." },
];

/** Report workflow shared by Assessments and Inspections: create drafts, edit, review, sign off, download. */
export function ReportView({ id, basePath }: { id: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const { canWrite, loaded } = useRole();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [includeMaterials, setIncludeMaterials] = useState(false);
  const [narrative, setNarrative] = useState<Narrative>({});
  const [confirmReviewed, setConfirmReviewed] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  const load = useCallback(
    async (keepSelection = true) => {
      setError(null);
      try {
        const res = await fetch(`/api/reports/snapshot?assessmentId=${id}`);
        const data = (await res.json().catch(() => ({}))) as { snapshots?: Snapshot[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load reports");
        const list = data.snapshots ?? []; // newest first
        setSnapshots(list);
        setSelectedId((cur) => (keepSelection && cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const selected = useMemo(() => snapshots.find((s) => s.id === selectedId) ?? null, [snapshots, selectedId]);

  // Load the draft's narrative into the editor when the selection changes.
  useEffect(() => {
    setNarrative(selected?.payload?.narrative ?? {});
    setConfirmReviewed(false);
  }, [selected?.id, selected?.payload?.narrative]);

  async function createDraft() {
    setBusy("create");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, includeMaterials }) });
      const data = (await res.json().catch(() => ({}))) as { snapshot?: Snapshot; error?: string };
      if (!res.ok || !data.snapshot) throw new Error(data.error ?? "Could not create the draft");
      await load(false);
      setSelectedId(data.snapshot.id);
      setMsg("New draft created from the current saved facts. Edit the sections below, review it, then sign off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveNarrative() {
    if (!selected) return;
    setBusy("save");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/snapshot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: selected.id, narrative }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      await load();
      setMsg("Saved. The preview below reflects your edits.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function finalize() {
    if (!selected) return;
    setBusy("finalize");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: selected.id, confirmReviewed: true, reviewNote: reviewNote.trim() || undefined }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not finalize");
      setReviewNote("");
      await load();
      setMsg("Finalized and signed off. This version is now immutable — later changes need a new draft.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    if (!selected) return;
    setBusy("pdf");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: selected.id }) });
      const data = (await res.json().catch(() => ({}))) as { pdfBase64?: string; error?: string; signedUrl?: string | null };
      if (!res.ok || !data.pdfBase64) throw new Error(data.error ?? "Could not generate the PDF");
      const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${selected.id.slice(0, 8)}-${selected.finalized ? "final" : "draft"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(selected.finalized ? "Downloaded the finalized report." : "Downloaded a DRAFT — it is watermarked as unreviewed until signed off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const draft = selected && !selected.finalized;
  const editable = !!draft && canWrite;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Report · {id.slice(0, 8)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={includeMaterials} onChange={(e) => setIncludeMaterials(e.target.checked)} /> include materials</label>
              <button onClick={createDraft} disabled={busy !== null} className="btn-primary text-xs">{busy === "create" ? "Creating…" : "Create new draft"}</button>
            </>
          ) : null}
          <button onClick={downloadPdf} disabled={!selected || busy !== null} className="btn-secondary text-xs">{busy === "pdf" ? "Generating…" : "Download PDF"}</button>
          <button onClick={() => window.print()} className="btn-secondary text-xs">Print</button>
        </div>
      </div>

      {loaded && !canWrite ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only — you can read and download reports but not create or sign them off.</div> : null}
      {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {msg ? <div role="status" className="rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{msg}</div> : null}
      {loading ? <div className="card p-6 text-sm text-slate-500">Loading reports…</div> : null}

      {snapshots.length > 0 ? (
        <div className="card p-3 space-y-2">
          <label className="block text-xs font-medium text-slate-700">Version
            <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  v{s.assessmentVersion} · {s.finalized ? "FINALIZED" : "draft"} · {new Date(s.createdAt).toLocaleString()}{s.materialsVersion ? ` · materials v${s.materialsVersion}` : ""}
                </option>
              ))}
            </select>
          </label>
          {selected?.finalized ? (
            <p className="text-xs text-green-800">Finalized (immutable){selected.reviewedByLabel ? ` · signed off by ${selected.reviewedByLabel}` : ""}{selected.reviewedAt ? ` on ${new Date(selected.reviewedAt).toLocaleString()}` : ""}{selected.reviewNote ? ` — “${selected.reviewNote}”` : ""}</p>
          ) : (
            <p className="text-xs text-amber-800">Draft — not reviewed or signed off yet. Edits below change only this draft.</p>
          )}
        </div>
      ) : !loading ? (
        <div className="card p-6 text-center text-sm text-slate-500">No report yet. Press <strong>Create new draft</strong> to assemble one from the saved facts, then edit, review and sign it off.</div>
      ) : null}

      {draft && canWrite ? (
        <div className="card p-3 space-y-3">
          <div className="text-sm font-semibold">Edit this draft</div>
          {SECTIONS.map((sec) => (
            <label key={sec.key} className="block text-sm">{sec.label}
              <textarea value={narrative[sec.key] ?? ""} onChange={(e) => setNarrative((n) => ({ ...n, [sec.key]: e.target.value }))} rows={sec.key === "notes" ? 3 : 4} maxLength={5000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <span className="text-xs text-slate-500">{sec.hint}</span>
            </label>
          ))}
          <button onClick={saveNarrative} disabled={busy !== null} className="btn-secondary text-xs">{busy === "save" ? "Saving…" : "Save edits"}</button>
        </div>
      ) : null}

      {selected?.htmlPreview ? (
        <div className="card p-0 overflow-hidden bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium">Preview — built from the stored snapshot (no AI regeneration)</div>
          {/* Sandboxed with no permissions: report text can never run script or reach the app. */}
          <iframe title="Report preview" sandbox="" srcDoc={selected.htmlPreview} className="h-[760px] w-full bg-white" />
        </div>
      ) : null}

      {editable ? (
        <div className="card p-3 space-y-3 border-amber-300">
          <div className="text-sm font-semibold">Review and sign off</div>
          <p className="text-xs text-slate-600">Finalizing makes this exact version immutable and records you as the reviewer. It is refused while the completeness review has blockers, or if the assessment changed after this draft was created.</p>
          <label className="block text-sm">Note for the record (optional)
            <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmReviewed} onChange={(e) => setConfirmReviewed(e.target.checked)} />
            <span>I have read this report, checked the findings, measurements and recommendations against the evidence, and I am responsible for its conclusions.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={finalize} disabled={!confirmReviewed || busy !== null} className="btn-primary text-xs">{busy === "finalize" ? "Finalizing…" : "Sign off and finalize"}</button>
            <Link href={`${basePath}/${id}/completeness` as never} className="btn-secondary text-xs">Check completeness</Link>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-500">A report is a versioned snapshot. Drafts can be edited; finalized reports never change — new work creates a new draft. This document is not a certification.</p>
    </div>
  );
}
