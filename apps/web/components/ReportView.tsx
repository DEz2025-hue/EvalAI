"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NARRATIVE_SECTIONS, type NarrativeTextKey, downloadGate, photoNumbers, previewKey, type DesignProposal, type ReportKeyFinding, type ReportNarrative, type SolarDesign } from "@eval-ai/shared";
import { useRole } from "./useRole";
import { KeyFindingsEditor } from "./KeyFindingsEditor";
import { DesignEditor } from "./DesignEditor";
import { SolarDesignEditor } from "./SolarDesignEditor";
import { ReportPhotoSteps } from "./ReportPhotoSteps";
import { CardLoading } from "./Skeleton";

type Narrative = ReportNarrative;
/** What the AI said about its own draft, shown under the editor until the next draft. */
type DraftNotes = { missing: string[]; assumptions: string[]; figures: string[]; dropped: string[] };
type DraftResponse = Narrative & { design?: DesignProposal; solar?: SolarDesign; continueWith?: "designWrite"; missingInformation?: string[]; assumptions?: string[]; unverifiedFigures?: string[]; droppedFindings?: string[]; error?: string };
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
  payload?: { narrative?: Narrative; photos?: Array<{ evidenceId: string }> };
  reviewedByLabel?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

const HINTS: Record<NarrativeTextKey, string> = {
  summary: "A short plain-language overview: what was assessed, the overall picture, the top priorities and the next step. It should not repeat the findings.",
  siteOverview: "Where the site is and what the job covers.",
  recommendations: "Anything you want to add to the recommended actions, which are built from the findings above. AI drafts are only suggestions — write what you stand behind.",
  openItems: "What is unknown or still to be checked.",
  notes: "Anything the reader should know about scope, access or caveats.",
  observations: "Written before the report had key findings. It is still shown in the report.",
  issues: "Written before the report had key findings. It is still shown in the report.",
};

/** The text sections an AI draft fills in (the key findings are drafted too; reviewer notes are always the person's own). */
const DRAFTED = ["summary", "siteOverview", "openItems"] as const;

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
  // Preview before download (D-024): a draft can be downloaded only after this exact version was looked through.
  const [previewed, setPreviewed] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState("");
  const [draftNotes, setDraftNotes] = useState<DraftNotes | null>(null);
  // Photos the AI looked at that the person has not yet answered "Add" or "Leave out" for (D-024): a draft waits for those answers.
  const [photosWaiting, setPhotosWaiting] = useState(0);

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

  /** Ask the AI to write the report sections for this draft. Throws with the reason when it can't. */
  async function fetchWriteUp(snapshotId: string): Promise<{ text: Narrative; keyFindings: ReportKeyFinding[]; design?: DesignProposal; solar?: SolarDesign; notes: DraftNotes }> {
    const post = async (body: Record<string, unknown>) => {
      const res = await fetch("/api/ai/report-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, snapshotId, ...body }) });
      const data = (await res.json().catch(() => ({}))) as DraftResponse;
      if (!res.ok) throw new Error(data.error ?? "AI suggestions are unavailable");
      return data;
    };
    let data = await post({});
    // A design proposal comes in two steps (D-034): the camera plan, then the write-up around it. If the write-up fails, the plan is kept.
    let writeUpError = "";
    if (data.continueWith === "designWrite" && (data.design || data.solar)) {
      const plan = data;
      try {
        data = await post({ stage: "designWrite", ...(plan.design ? { design: plan.design } : { solar: plan.solar }) });
      } catch (e) {
        writeUpError = e instanceof Error ? e.message : String(e);
      }
    }
    const text: Narrative = {};
    for (const k of DRAFTED) if (typeof data[k] === "string" && data[k]!.trim()) text[k] = data[k]!;
    return {
      text,
      keyFindings: data.keyFindings ?? [],
      // A new CCTV installation gets a design proposal instead of key findings (D-034).
      design: data.design,
      // A new solar installation gets a solar design and sizing proposal (D-036).
      solar: data.solar,
      notes: {
        missing: [...(writeUpError ? [`The design plan was drafted, but the summary, options, equipment and open items were not (${writeUpError}). Press Rewrite with AI to try again, or write them yourself.`] : []), ...(data.missingInformation ?? []).filter(Boolean)],
        assumptions: (data.assumptions ?? []).filter(Boolean),
        figures: (data.unverifiedFigures ?? []).filter(Boolean),
        dropped: (data.droppedFindings ?? []).filter(Boolean),
      },
    };
  }

  /** Rewrite only the summary and open items from the key findings as they are now (the person's edits are saved first, so the AI reads them). */
  async function rewriteSummary() {
    if (!selected) return;
    setBusy("summary");
    setError(null);
    setMsg(null);
    try {
      const save = await fetch("/api/reports/snapshot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: selected.id, narrative: { keyFindings: narrative.keyFindings ?? [] } }) });
      if (!save.ok) throw new Error(((await save.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save your findings first");
      const res = await fetch("/api/ai/report-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, snapshotId: selected.id, stage: "summary" }) });
      const data = (await res.json().catch(() => ({}))) as DraftResponse;
      if (!res.ok) throw new Error(data.error ?? "AI suggestions are unavailable");
      setNarrative((n) => ({ ...n, summary: data.summary ?? n.summary, openItems: data.openItems ?? n.openItems }));
      setDraftNotes({ missing: [], assumptions: [], figures: (data.unverifiedFigures ?? []).filter(Boolean), dropped: [] });
      await load();
      setMsg("The summary and open items were rewritten from your findings and added to the editor. Read them, then press Save edits.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function createDraft() {
    if (photosWaiting > 0) {
      setError(`${photosWaiting} photo${photosWaiting === 1 ? " is" : "s are"} waiting for your answer. Open "Photos for the report" and choose Add to report or Leave out for each, then save your choices.`);
      return;
    }
    setBusy("create");
    setError(null);
    setMsg(null);
    setDraftNotes(null);
    try {
      const res = await fetch("/api/reports/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id, includeMaterials }) });
      const data = (await res.json().catch(() => ({}))) as { snapshot?: Snapshot; error?: string };
      if (!res.ok || !data.snapshot) throw new Error(data.error ?? "Could not create the draft");
      const snapshotId = data.snapshot.id;
      // Write the report out of the saved facts straight away. If the AI is unavailable the draft is still a complete
      // record of the saved facts, and the sections can be written by hand.
      setBusy("write");
      let note = "";
      try {
        const { text, keyFindings, design, solar, notes } = await fetchWriteUp(snapshotId);
        const save = await fetch("/api/reports/snapshot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId, narrative: { ...text, keyFindings, ...(design ? { design } : {}), ...(solar ? { solar } : {}) } }) });
        if (!save.ok) throw new Error(((await save.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save the written sections");
        setDraftNotes(notes);
        note = "The written sections were drafted by AI from your saved facts. Read each one, correct it, then press Save edits.";
      } catch (e) {
        note = `The report was assembled from your saved facts, but the written sections could not be drafted (${e instanceof Error ? e.message : String(e)}). You can write them yourself, or try “Rewrite with AI”.`;
      }
      await load(false);
      setSelectedId(snapshotId);
      setMsg(`New draft created. ${note}`);
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

  async function suggestWithAi() {
    if (!selected) return;
    const hasText = DRAFTED.some((k) => narrative[k]?.trim()) || !!narrative.keyFindings?.length || !!narrative.design || !!narrative.solar;
    if (hasText && !confirm("Replace the summary, site overview, key findings or design, and open items in the editor with a new AI draft? Your saved version is not changed until you press Save edits. Reviewer notes and additional recommendations are kept.")) return;
    setBusy("suggest");
    setError(null);
    setMsg(null);
    try {
      const { text, keyFindings, design, solar, notes } = await fetchWriteUp(selected.id);
      setNarrative((n) => ({ ...n, ...Object.fromEntries(DRAFTED.map((k) => [k, text[k] ?? ""])), keyFindings, ...(design ? { design } : {}), ...(solar ? { solar } : {}) }));
      setDraftNotes(notes);
      setMsg("AI draft added to the editor. It is a suggestion built from your saved facts — read it, correct it, then press Save edits.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** Puts the office's current report style into this draft (a finalized report is never restyled). */
  async function restyle() {
    if (!selected) return;
    setBusy("style");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/reports/template-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: selected.id }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not apply the style");
      await load(true);
      setMsg("The office report style is applied to this draft. Preview it again before downloading.");
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

  /** One labelled text box for a written section. */
  const sectionField = (key: NarrativeTextKey) => {
    const sec = NARRATIVE_SECTIONS.find((s) => s.key === key)!;
    return (
      <label key={key} className="block text-sm">{sec.label}
        <textarea value={narrative[key] ?? ""} onChange={(e) => setNarrative((n) => ({ ...n, [key]: e.target.value }))} rows={key === "notes" || key === "openItems" ? 3 : key === "observations" ? 8 : 4} maxLength={sec.max} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <span className="text-xs text-slate-500">{HINTS[key]}</span>
      </label>
    );
  };

  const draft = selected && !selected.finalized;
  const editable = !!draft && canWrite;
  const gate = downloadGate(selected ? { id: selected.id, finalized: selected.finalized, payload: selected.payload } : null, selected ? previewed[selected.id] : null);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Report · {id.slice(0, 8)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={includeMaterials} onChange={(e) => setIncludeMaterials(e.target.checked)} /> include materials</label>
              <button onClick={createDraft} disabled={busy !== null} className="btn-primary text-xs">{busy === "create" ? "Creating…" : busy === "write" ? "Writing the report…" : "Create new draft"}</button>
            </>
          ) : null}
          <button onClick={downloadPdf} disabled={!selected || busy !== null || gate.locked} title={gate.reason ?? undefined} className="btn-secondary text-xs">{busy === "pdf" ? "Generating…" : "Download PDF"}</button>
          <button onClick={() => window.print()} className="btn-secondary text-xs">Print</button>
        </div>
      </div>

      {loaded && !canWrite ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only — you can read and download reports but not create or sign them off.</div> : null}
      {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {msg ? <div role="status" className="rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{msg}</div> : null}
      {loading ? <CardLoading label="Loading reports…" lines={4} /> : null}

      <ReportPhotoSteps assessmentId={id} canWrite={canWrite} onUnanswered={setPhotosWaiting} />

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
          {/* Summary and site first, then the findings the report is built around, then the extras. Older free-text sections only show when they hold text. */}
          {(["summary", "siteOverview"] as const).map((k) => sectionField(k))}
          {narrative.solar ? (
            <SolarDesignEditor value={narrative.solar} onChange={(solar) => setNarrative((n) => ({ ...n, solar }))} />
          ) : narrative.design ? (
            <DesignEditor value={narrative.design} onChange={(design) => setNarrative((n) => ({ ...n, design }))} />
          ) : (
            <KeyFindingsEditor value={narrative.keyFindings ?? []} onChange={(keyFindings) => setNarrative((n) => ({ ...n, keyFindings }))} photoNumber={photoNumbers({ photos: selected?.payload?.photos as never })} />
          )}
          {(["recommendations", "openItems", "notes"] as const).map((k) => sectionField(k))}
          {NARRATIVE_SECTIONS.filter((s) => s.legacy && narrative[s.key]?.trim()).map((s) => sectionField(s.key))}
          {draftNotes?.dropped.length ? <p className="text-xs text-slate-600"><strong>The AI wrote findings that were left out</strong> because they were incomplete or had no source in your record: {draftNotes.dropped.join("; ")}.</p> : null}
          {draftNotes?.figures.length ? (
            <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Check these figures before you rely on them:</strong> {draftNotes.figures.join("; ")}. They are not in your saved data, so the AI may have made them up.
            </div>
          ) : null}
          {draftNotes?.missing.length ? <p className="text-xs text-slate-600"><strong>The AI noted missing information:</strong> {draftNotes.missing.join("; ")}</p> : null}
          {draftNotes?.assumptions.length ? <p className="text-xs text-slate-600"><strong>Assumptions the AI made:</strong> {draftNotes.assumptions.join("; ")}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button onClick={saveNarrative} disabled={busy !== null} className="btn-secondary text-xs">{busy === "save" ? "Saving…" : "Save edits"}</button>
            <button onClick={suggestWithAi} disabled={busy !== null} className="btn-secondary text-xs">{busy === "suggest" ? "Asking AI…" : "Rewrite with AI"}</button>
            {narrative.design || narrative.solar ? null : <button onClick={rewriteSummary} disabled={busy !== null} className="btn-secondary text-xs">{busy === "summary" ? "Writing…" : "Rewrite summary from my findings"}</button>}
            <button onClick={restyle} disabled={busy !== null} className="btn-secondary text-xs" title="Use the office's current report style (set in Settings)">{busy === "style" ? "Applying…" : "Re-apply office style"}</button>
          </div>
          <p className="text-xs text-slate-500">AI drafts are built from your saved facts and photos and are suggestions: nothing is saved until you save, &ldquo;what it means&rdquo; may use general technical knowledge, and you are responsible for the final text.</p>
        </div>
      ) : null}

      {selected?.htmlPreview ? (
        <div className="card p-0 overflow-hidden bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium">Preview — built from the stored snapshot (no AI regeneration)</div>
          {/* Sandboxed with no permissions: report text can never run script or reach the app. */}
          <iframe title="Report preview" sandbox="" srcDoc={selected.htmlPreview} className="h-[760px] w-full bg-white" />
          {!selected.finalized ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2">
              {gate.locked ? (
                <>
                  <button onClick={() => setPreviewed((p) => ({ ...p, [selected.id]: previewKey({ id: selected.id, finalized: selected.finalized, payload: selected.payload }) }))} className="btn-primary text-xs">I&apos;ve looked through this preview</button>
                  <span className="text-xs text-slate-600">{gate.reason} Download PDF unlocks after you confirm.</span>
                </>
              ) : (
                <span className="text-xs text-green-800">Previewed — you can download this version. Change anything and you will be asked to look again.</span>
              )}
            </div>
          ) : null}
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
