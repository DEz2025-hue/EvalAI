"use client";
import { useCallback, useEffect, useState } from "react";

type ChoicePhoto = {
  evidenceId: string;
  caption: string;
  observations: string[];
  possibleIssues: Array<{ text: string; confidence: string }>;
  cannotTell: string[];
  itemTitle: string | null;
  thumbnail: string | null;
  /** true = add, false = leave out, null = not answered yet. */
  choice: boolean | null;
};

/**
 * Photos for the report (D-022, D-024), the same steps as on the phone: the AI looks at the job's photos, then the person says for each
 * one whether it goes in the report. Only photos that were looked at AND answered "Add" are written up. The report cites them by number.
 */
export function ReportPhotoSteps({ assessmentId, canWrite, onUnanswered }: { assessmentId: string; canWrite: boolean; onUnanswered: (count: number) => void }): JSX.Element | null {
  const [photos, setPhotos] = useState<ChoicePhoto[]>([]);
  const [answers, setAnswers] = useState<Record<string, boolean | null>>({});
  const [busy, setBusy] = useState<"look" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ai/report-photos?assessmentId=${assessmentId}`);
    const data = (await res.json().catch(() => ({}))) as { photos?: ChoicePhoto[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not load the photos");
    const list = data.photos ?? [];
    setPhotos(list);
    setAnswers(Object.fromEntries(list.map((p) => [p.evidenceId, p.choice])));
  }, [assessmentId]);

  useEffect(() => {
    load().catch(() => undefined).finally(() => setLoaded(true));
  }, [load]);

  // The saved answers decide what is still waiting; unsaved clicks don't count until "Save my choices".
  const waiting = photos.filter((p) => p.choice === null).length;
  useEffect(() => onUnanswered(waiting), [waiting, onUnanswered]);

  const unanswered = photos.filter((p) => typeof answers[p.evidenceId] !== "boolean").length;
  const dirty = photos.some((p) => (answers[p.evidenceId] ?? null) !== p.choice);
  const added = photos.filter((p) => p.choice === true).length;

  async function look() {
    setBusy("look");
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/ai/report-photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId }) });
      const data = (await res.json().catch(() => ({}))) as { analyzed?: number; cached?: number; skipped?: number; failed?: string[]; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The photos could not be looked at");
      await load();
      const notes = [
        data.total === 0 ? "This job has no photos yet. Add some in the Evidence gallery." : `${data.analyzed ?? 0} new photo${data.analyzed === 1 ? "" : "s"} looked at${data.cached ? `, ${data.cached} already done` : ""}.`,
        (data.skipped ?? 0) > 0 ? `${data.skipped} left out because a report holds at most 12.` : "",
        (data.failed?.length ?? 0) > 0 ? `${data.failed!.length} could not be looked at.` : "",
      ].filter(Boolean);
      setMsg(notes.join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    setMsg(null);
    try {
      const choices = Object.fromEntries(photos.map((p) => [p.evidenceId, answers[p.evidenceId] === true]));
      const res = await fetch("/api/reports/photo-choices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, choices }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save your choices");
      await load();
      setMsg("Your choices are saved. New drafts will use them.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) return null;
  if (!canWrite && photos.length === 0) return null;
  const setAll = (v: boolean) => setAnswers(Object.fromEntries(photos.map((p) => [p.evidenceId, v])));

  return (
    <details className="card p-3" open={waiting > 0}>
      <summary className="cursor-pointer text-sm font-semibold">
        Photos for the report {photos.length ? `· ${added} of ${photos.length} added` : ""}
        {waiting > 0 ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">{waiting} need your answer</span> : null}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">The AI looks at your job photos and describes what is visible. You choose which photos go in the report; the write-up cites them as Photo 1, Photo 2… The descriptions are not verified.</p>
        {canWrite ? <button type="button" onClick={look} disabled={busy !== null} className="btn-secondary text-xs">{busy === "look" ? "Looking at your photos…" : photos.length ? "Look at new photos" : "Look at my photos"}</button> : null}
        {error ? <div role="alert" className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        {msg ? <div role="status" className="rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">{msg}</div> : null}
        {photos.length > 0 && canWrite ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAll(true)} className="btn-secondary text-xs">Add all</button>
              <button type="button" onClick={() => setAll(false)} className="btn-secondary text-xs">Leave all out</button>
            </div>
            <ul className="space-y-3">
              {photos.map((p, i) => {
                const a = answers[p.evidenceId];
                return (
                  <li key={p.evidenceId} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong>Photo {i + 1}</strong>
                      {p.itemTitle ? <span className="text-xs text-slate-500">{p.itemTitle}</span> : null}
                      <span className={`ml-auto rounded px-1.5 py-0.5 text-xs ${a === true ? "bg-green-100 text-green-800" : a === false ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{a === true ? "Will be added" : a === false ? "Left out" : "Your answer needed"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.thumbnail ? <img src={p.thumbnail} alt={p.caption || `Photo ${i + 1}`} className="max-h-40 rounded border border-slate-200" /> : null}
                      <div className="min-w-0 flex-1 text-sm">
                        {p.caption ? <p>{p.caption}</p> : null}
                        {p.observations.length ? <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">{p.observations.map((o, j) => <li key={j}>{o}</li>)}</ul> : null}
                        {p.possibleIssues.length ? <p className="mt-1 text-xs text-amber-800">Possible issues (AI, not verified): {p.possibleIssues.map((x) => x.text).join("; ")}</p> : null}
                        {p.cannotTell.length ? <p className="mt-1 text-xs text-slate-500">Cannot be told from this photo: {p.cannotTell.join("; ")}</p> : null}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" aria-pressed={a === true} onClick={() => setAnswers((m) => ({ ...m, [p.evidenceId]: true }))} className={`text-xs px-3 py-1.5 rounded-full border ${a === true ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>Add to report</button>
                      <button type="button" aria-pressed={a === false} onClick={() => setAnswers((m) => ({ ...m, [p.evidenceId]: false }))} className={`text-xs px-3 py-1.5 rounded-full border ${a === false ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>Leave out</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={save} disabled={busy !== null || unanswered > 0 || !dirty} className="btn-primary text-xs">{busy === "save" ? "Saving…" : "Save my choices"}</button>
              {unanswered > 0 ? <span className="text-xs text-amber-800">{unanswered} photo{unanswered === 1 ? "" : "s"} still need{unanswered === 1 ? "s" : ""} your answer.</span> : null}
            </div>
          </>
        ) : null}
        {photos.length === 0 ? <p className="text-xs text-slate-500">No photos have been looked at yet. Add photos in the Evidence gallery, then press the button above. You can also skip this: the report is built without photos.</p> : null}
      </div>
    </details>
  );
}
