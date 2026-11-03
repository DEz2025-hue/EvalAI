"use client";
import { useEffect, useRef, useState } from "react";
import { appendTurn, canAskMore, endInterview, interviewProgress, newInterview, questionCount, turnsForPrompt, type InterviewState, type InterviewVia } from "@eval-ai/shared";
import { VoiceRecorder } from "./VoiceRecorder";

const JSON_HEADERS = { "Content-Type": "application/json" };

type Digest = {
  itemNotes: Array<{ itemTitle: string; note: string; quote: string }>;
  findingDrafts: Array<{ title: string; description: string; quotes: string[] }>;
  briefLines: Array<{ label: string; value: string; quote: string }>;
  contradictions: Array<{ statement: string; conflictsWith: string }>;
  openQuestions: string[];
  unverifiedFigures: string[];
};
type Keep<T> = T & { keep: boolean };
type Review = { notes: Array<Keep<Digest["itemNotes"][number]>>; findings: Array<Keep<Digest["findingDrafts"][number]>>; brief: Array<Keep<Digest["briefLines"][number]>>; rest: Digest };

/** Adds a line to a checklist item's notes. The item's status and measurement are sent back unchanged: a spoken or typed note never decides Pass or Fail. */
async function appendItemNote(assessmentId: string, itemId: string, line: string): Promise<void> {
  const cur = await fetch("/api/checklist/responses?assessmentId=" + assessmentId);
  const list = cur.ok ? (((await cur.json().catch(() => ({}))) as { responses?: Array<{ itemId: string; status?: string; notes?: string; measuredValue?: number | string | null; measuredUnit?: string | null }> }).responses ?? []) : [];
  const existing = list.find((r) => r.itemId === itemId);
  const notes = [existing?.notes, line].filter(Boolean).join("\n").slice(0, 2000);
  const res = await fetch("/api/checklist/responses", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, responses: [{ itemId, status: existing?.status ?? "not_checked", notes, measuredValue: existing?.measuredValue, measuredUnit: existing?.measuredUnit }] }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save the note");
}

function speak(text: string) {
  try {
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* the question is on screen anyway */
  }
}
const stopSpeaking = () => {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* nothing to stop */
  }
};

/**
 * Site interview (D-030): a turn-based conversation, not a live call. The AI asks one question at a time, you answer by typing (or recording
 * where transcription is available), and at the end the AI proposes notes that quote your own words. Nothing said changes a checklist status.
 */
export function InterviewPanel({ assessmentId, items, initial }: { assessmentId: string; items: Array<{ id: string; title: string }>; initial?: InterviewState | null }): JSX.Element {
  const [state, setState] = useState<InterviewState | null>(initial ?? null);
  const ref = useRef<InterviewState | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [aloud, setAloud] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (initial && !ref.current) {
      ref.current = initial;
      setState(initial);
    }
  }, [initial]);
  useEffect(() => stopSpeaking, []);

  async function save(next: InterviewState) {
    ref.current = next;
    setState(next);
    await fetch("/api/assessments/" + assessmentId, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ context: { interview: next } }) }).catch(() => undefined);
  }
  const now = () => new Date().toISOString();
  const uid = () => "t" + Date.now() + Math.random().toString(36).slice(2, 6);

  async function askNext(from: InterviewState) {
    setBusy(true);
    setError(null);
    try {
      if (!canAskMore(from)) return void (await save(endInterview(from)));
      const res = await fetch("/api/ai/interview", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, turns: turnsForPrompt(from), questionsAsked: questionCount(from) }) });
      const data = (await res.json().catch(() => ({}))) as { question?: string; topic?: string; done?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't ask the next question");
      if (data.done || !data.question) return void (await save(endInterview(from)));
      const r = appendTurn(from, { id: uid(), role: "ai", text: data.question, at: now(), topic: data.topic || undefined });
      if (!r.ok) return void (await save(endInterview(from)));
      await save(r.state);
      if (aloud) speak(data.question);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(text: string, via: InterviewVia) {
    const cur = ref.current;
    if (!cur || !text.trim()) return;
    const r = appendTurn(cur, { id: uid(), role: "person", text, at: now(), via });
    if (!r.ok) return;
    stopSpeaking();
    setAnswer("");
    await save(r.state);
    await askNext(r.state);
  }

  async function readIt() {
    const cur = ref.current;
    if (!cur) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/interview/digest", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, turns: cur.turns.map((t) => ({ role: t.role, text: t.text })) }) });
      const data = (await res.json().catch(() => ({}))) as Digest & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't read the interview");
      setReview({ notes: data.itemNotes.map((x) => ({ ...x, keep: true })), findings: data.findingDrafts.map((x) => ({ ...x, keep: true })), brief: data.briefLines.map((x) => ({ ...x, keep: true })), rest: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const cur = ref.current;
    if (!cur || !review) return;
    setSaving(true);
    setError(null);
    try {
      for (const n of review.notes.filter((x) => x.keep && x.note.trim())) {
        const item = items.find((i) => i.title === n.itemTitle);
        if (item) await appendItemNote(assessmentId, item.id, `Interview: ${n.note.trim()} (said: "${n.quote}")`);
      }
      for (const f of review.findings.filter((x) => x.keep)) {
        const res = await fetch("/api/findings", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, title: f.title.slice(0, 120), description: `${f.description}\nReported in the interview, not verified. Said: "${f.quotes[0]}"` }) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save a finding");
      }
      const brief = review.brief.filter((x) => x.keep).map(({ label, value, quote }) => ({ label, value, quote }));
      await save({ ...cur, status: "reviewed", reviewedAt: now(), brief, openQuestions: review.rest.openQuestions.slice(0, 8) });
      setReview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const last = state?.turns[state.turns.length - 1];
  const waiting = state?.status === "active" && last?.role === "ai";
  const progress = state ? interviewProgress(state) : null;
  const toggle = <K extends "notes" | "findings" | "brief">(key: K, i: number) => setReview((r) => r && { ...r, [key]: r[key].map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)) });

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Interview <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800">AI asks, you answer</span></h2>
          <p className="mt-1 text-xs text-slate-600">The AI asks one question at a time about the job. You answer by typing, or by voice where transcription is available. It is a turn-based interview, not a live call, and nothing you say changes a checklist answer.</p>
        </div>
        {!open ? <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs">{state && state.turns.length > 0 ? "Open" : "Start"}</button> : null}
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

          {!state || state.turns.length === 0 ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={aloud} onChange={(e) => setAloud(e.target.checked)} /> Read questions aloud</label>
              <button type="button" disabled={busy} onClick={() => askNext(newInterview(now()))} className="btn-primary text-xs">{busy ? "Starting…" : "Start interview"}</button>
            </div>
          ) : state.status === "reviewed" ? (
            <div className="rounded border border-green-200 bg-green-50 p-3 text-xs text-green-800">Interview saved ({progress?.answered ?? 0} answers). Accepted notes were added to their checklist items with your words quoted. Details will appear in the report as statements made in the interview.</div>
          ) : state.status === "ended" ? (
            !review ? (
              <div className="space-y-2">
                <p className="text-sm">Interview finished ({progress?.answered ?? 0} answers).</p>
                {(progress?.answered ?? 0) > 0 ? <button type="button" disabled={busy} onClick={readIt} className="btn-primary text-xs">{busy ? "Reading…" : "Review what I said"}</button> : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">AI proposals from your own words. Statements are not verified facts. Untick anything you don&apos;t want.{review.rest.unverifiedFigures.length ? ` Check these figures, you didn't say them: ${review.rest.unverifiedFigures.join(", ")}.` : ""}</div>
                {review.notes.length > 0 ? <h3 className="text-xs font-semibold">Notes for checklist items</h3> : null}
                {review.notes.map((n, i) => (
                  <div key={"n" + i} className={`rounded border border-slate-200 p-2 text-xs ${n.keep ? "" : "opacity-50"}`}>
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={n.keep} onChange={() => toggle("notes", i)} /> {n.itemTitle}</label>
                    <textarea value={n.note} onChange={(e) => setReview((r) => r && { ...r, notes: r.notes.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)) })} rows={2} className="mt-1 w-full rounded border border-slate-200 p-1" />
                    <div className="mt-1 text-slate-500">You said: “{n.quote}”</div>
                  </div>
                ))}
                {review.findings.length > 0 ? <h3 className="text-xs font-semibold">Finding drafts (need review)</h3> : null}
                {review.findings.map((f, i) => (
                  <div key={"f" + i} className={`rounded border border-slate-200 p-2 text-xs ${f.keep ? "" : "opacity-50"}`}>
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={f.keep} onChange={() => toggle("findings", i)} /> {f.title}</label>
                    <p className="mt-1">{f.description}</p>
                    <div className="mt-1 text-slate-500">You said: “{f.quotes[0]}”</div>
                  </div>
                ))}
                {review.brief.length > 0 ? <h3 className="text-xs font-semibold">Details for the report</h3> : null}
                {review.brief.map((b, i) => (
                  <div key={"b" + i} className={`rounded border border-slate-200 p-2 text-xs ${b.keep ? "" : "opacity-50"}`}>
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={b.keep} onChange={() => toggle("brief", i)} /> {b.label}</label>
                    <p className="mt-1">{b.value}</p>
                    <div className="mt-1 text-slate-500">You said: “{b.quote}”</div>
                  </div>
                ))}
                {review.rest.contradictions.length > 0 ? <div className="rounded bg-amber-50 p-2 text-xs text-amber-900"><b>Things that don&apos;t match:</b> {review.rest.contradictions.map((c) => `${c.statement} — but: ${c.conflictsWith}`).join(" · ")}</div> : null}
                {review.rest.openQuestions.length > 0 ? <div className="rounded bg-slate-50 p-2 text-xs"><b>Still to check on site:</b> {review.rest.openQuestions.join(" · ")}</div> : null}
                {review.notes.length + review.findings.length + review.brief.length === 0 ? <p className="text-xs text-slate-600">Nothing in the conversation was specific enough to propose.</p> : null}
                <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={apply} className="btn-primary text-xs">{saving ? "Saving…" : "Save what I kept"}</button>
                  <button type="button" onClick={() => setReview(null)} className="btn-secondary text-xs">Discard</button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Question {Math.min(progress?.asked ?? 0, progress?.max ?? 12)} of up to {progress?.max}</div>
              {busy && !waiting ? <p className="text-xs text-slate-500">Thinking of the next question…</p> : null}
              {waiting && last ? (
                <>
                  {last.topic ? <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800">{last.topic}</span> : null}
                  <p className="text-base font-medium">{last.text}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <button type="button" className="underline" onClick={() => speak(last.text)}>Read aloud</button>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={aloud} onChange={(e) => setAloud(e.target.checked)} /> Always read aloud</label>
                  </div>
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} className="w-full rounded border border-slate-300 p-2 text-sm" placeholder="Type your answer" aria-label="Your answer" />
                  <button type="button" disabled={!answer.trim() || busy} onClick={() => submit(answer, "text")} className="btn-primary text-xs">Send answer</button>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-600">Answer by voice instead</summary>
                    <div className="mt-2"><VoiceRecorder assessmentId={assessmentId} onTranscript={(t) => submit(t, "voice")} /></div>
                  </details>
                </>
              ) : null}
              {error && last?.role === "person" ? <button type="button" onClick={() => state && askNext(state)} className="btn-secondary text-xs">Try the next question again</button> : null}
              <div>
                <button type="button" onClick={async () => { stopSpeaking(); if (ref.current) await save(endInterview(ref.current)); }} className="btn-secondary text-xs">That&apos;s enough</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
