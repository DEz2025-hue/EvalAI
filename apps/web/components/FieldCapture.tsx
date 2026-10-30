"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PhotoCapture } from "./PhotoCapture";
import { VoiceRecorder } from "./VoiceRecorder";
import { useRole } from "./useRole";

type Item = { id: string; title: string };
type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string };

/**
 * Photo + voice capture wired to the job: evidence can be linked to a checklist item, and a CONFIRMED
 * voice transcript is saved as a note on that item (original audio is kept separately). Nothing is
 * silently dropped — the person sees what was saved.
 */
export function FieldCapture({ assessmentId, basePath }: { assessmentId: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const { canWrite, loaded } = useRole();
  const [items, setItems] = useState<Item[]>([]);
  const [noteItem, setNoteItem] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [evidenceCount, setEvidenceCount] = useState<number | null>(null);

  const refreshEvidence = useCallback(() => {
    fetch(`/api/evidence/upload?assessmentId=${assessmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => setEvidenceCount(d?.count ?? null))
      .catch(() => setEvidenceCount(null));
  }, [assessmentId]);

  useEffect(() => {
    fetch(`/api/checklist/items?assessmentId=${assessmentId}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: Item[] }) => setItems((d.items ?? []).map((i) => ({ id: i.id, title: i.title }))))
      .catch(() => setItems([]));
    refreshEvidence();
  }, [assessmentId, refreshEvidence]);

  async function saveTranscriptAsNote(text: string, audioId?: string) {
    setMessage(null);
    if (!noteItem) {
      setMessage({ kind: "error", text: "Choose which checklist item this voice note belongs to, then press Attach again." });
      return;
    }
    try {
      // Preserve the item's existing status/value — only the note changes.
      const cur = await fetch(`/api/checklist/responses?assessmentId=${assessmentId}`).then((r) => (r.ok ? r.json() : { responses: [] })) as { responses?: Resp[] };
      const existing = (cur.responses ?? []).find((r) => r.itemId === noteItem);
      const stamp = new Date().toLocaleString();
      const notes = [existing?.notes, `[Voice note ${stamp}${audioId ? " · audio kept" : ""}] ${text.trim()}`].filter(Boolean).join("\n").slice(0, 2000);
      const res = await fetch("/api/checklist/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, responses: [{ itemId: noteItem, status: existing?.status ?? "not_checked", notes, measuredValue: existing?.measuredValue, measuredUnit: existing?.measuredUnit }] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the note");
      setMessage({ kind: "ok", text: "Voice note saved to the checklist item. Numbers and units still need your verification." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  if (loaded && !canWrite) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Your role is read-only — photo and voice capture are available to members, admins and owners.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <PhotoCapture
          assessmentId={assessmentId}
          items={items}
          onUploaded={(_key, linked) => {
            refreshEvidence();
            setMessage({ kind: "ok", text: linked ? "Photo saved and linked to the checklist item." : "Photo saved to the job." });
          }}
        />
        <div className="space-y-2">
          {items.length > 0 ? (
            <label className="block text-xs">Attach voice note to checklist item
              <select value={noteItem} onChange={(e) => setNoteItem(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                <option value="">Choose an item…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
              </select>
            </label>
          ) : null}
          <VoiceRecorder assessmentId={assessmentId} itemId={noteItem || undefined} onTranscript={(t, audioId) => void saveTranscriptAsNote(t, audioId)} />
        </div>
      </div>
      {message ? <p role="status" className={`rounded px-3 py-2 text-xs ${message.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p> : null}
      <p className="text-xs text-slate-500">
        {evidenceCount === null ? "" : `${evidenceCount} evidence item(s) on this job · `}
        <Link href={`${basePath}/${assessmentId}/evidence` as never} className="underline">Open evidence gallery</Link>
      </p>
    </div>
  );
}
