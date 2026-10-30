"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "./useRole";

type Q = { id: string; question: string; type: "text" | "choice" | "number"; options?: string[]; required?: boolean };
type ApiQ = { id?: string; question: string; type?: "text" | "number" | "select" | "boolean" | "choice"; options?: string[]; required?: boolean };

const defaults = (isInspection: boolean): Q[] => [
  { id: "q1", question: isInspection ? "Inspection scope / standard to check against? (unknown if not available)" : "What is the primary goal / scope for this job? (unknown if not available)", type: "text" },
  { id: "q2", question: isInspection ? "Existing system — what do you know? (unknown if not available)" : "Existing equipment — what do you know? (unknown if not available)", type: "text" },
  { id: "q3", question: "Access constraints or follow-up checks needed?", type: "text" },
];

function normalize(list: ApiQ[]): Q[] {
  return list.map((q, i) => {
    const type = q.type === "number" ? "number" : q.type === "select" || q.type === "choice" ? "choice" : q.type === "boolean" ? "choice" : "text";
    const options = q.type === "boolean" ? ["Yes", "No"] : q.options;
    return { id: q.id ?? `ai${i}`, question: q.question, type: type === "choice" && !options?.length ? "text" : type, options, required: q.required ?? false };
  });
}

/**
 * Scope questions shared by Assessments and Inspections. Manual questions are always available; AI
 * questions are fetched only when you ask, and "unknown" is preserved rather than turned into a fact.
 */
export function ClarifyView({ id, basePath }: { id: string; basePath: "/assessments" | "/inspections" }): JSX.Element {
  const router = useRouter();
  const { canWrite, loaded } = useRole();
  const isInspection = basePath === "/inspections";
  const label = isInspection ? "Inspection" : "Assessment";
  const [questions, setQuestions] = useState<Q[]>(defaults(isInspection));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore what was answered before (answers persist on the job).
  useEffect(() => {
    let live = true;
    fetch(`/api/assessments/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { context?: { clarificationAnswers?: Record<string, string>; clarificationQuestions?: Record<string, string> } } | null) => {
        if (!live || !d?.context) return;
        const saved = d.context.clarificationAnswers ?? {};
        setAnswers(saved);
        // Keep previously asked AI questions visible so their answers are not orphaned.
        const known = new Set(defaults(isInspection).map((q) => q.id));
        const extra = Object.entries(d.context.clarificationQuestions ?? {}).filter(([qid]) => !known.has(qid)).map(([qid, question]) => ({ id: qid, question, type: "text" as const }));
        if (extra.length) setQuestions((cur) => [...cur, ...extra.filter((e) => !cur.some((c) => c.id === e.id))]);
      })
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id, isInspection]);

  const askAi = useCallback(async () => {
    setAsking(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/clarify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id }) });
      const data = (await res.json().catch(() => ({}))) as { questions?: ApiQ[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI is unavailable — continue with the questions below");
      const fresh = normalize(data.questions ?? []);
      if (fresh.length === 0) {
        setNotice("The AI had no further questions — the scope looks complete.");
        return;
      }
      setQuestions((cur) => [...cur, ...fresh.filter((f) => !cur.some((c) => c.question.trim().toLowerCase() === f.question.trim().toLowerCase())).map((f, i) => ({ ...f, id: `ai_${Date.now()}_${i}` }))]);
      setNotice(`${fresh.length} AI question(s) added below. Answer what you can — “Unknown” is fine.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }, [id]);

  async function save(next: "stay" | "checklist") {
    setError(null);
    const missing = questions.filter((q) => q.required && !(answers[q.id] ?? "").trim());
    if (missing.length > 0) {
      setError(`Please answer (or mark Unknown): ${missing.map((m) => `“${m.question}”`).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const asked = Object.fromEntries(questions.filter((q) => (answers[q.id] ?? "").trim()).map((q) => [q.id, q.question]));
      const res = await fetch(`/api/assessments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { clarificationAnswers: answers, clarificationQuestions: asked } }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Save failed");
      setNotice("Answers saved.");
      if (next === "checklist") router.push(`${basePath}/${id}/checklist-builder` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Loading scope questions…</div>;
  const readOnly = loaded && !canWrite;
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{label} scope questions</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)} · {questions.length} questions</span>
      </div>
      <p className="text-sm text-slate-600">Answer what you know. “Unknown” is kept as unknown — it is never turned into an invented fact. The AI can suggest more questions when you ask it to.</p>
      {readOnly ? <div className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">Your role is read-only.</div> : null}
      {error ? <div role="alert" className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">{notice}</div> : null}
      <div className="space-y-3">
        {questions.map((q) => (
          <label key={q.id} className="card p-4 block space-y-2">
            <div className="text-sm font-medium">{q.question} {q.required ? <span className="text-red-600">*</span> : <span className="text-xs text-slate-500">(optional)</span>}</div>
            {q.type === "choice" && q.options?.length ? (
              <select disabled={readOnly} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className="w-full rounded border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select — or Unknown</option>
                {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                <option value="unknown">Unknown / Not available</option>
              </select>
            ) : (
              <input disabled={readOnly} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder={q.type === "number" ? "Enter a number or Unknown" : "Type your answer or Unknown"} maxLength={1000} className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <>
            <button onClick={() => save("stay")} disabled={saving} className="btn-secondary">{saving ? "Saving…" : "Save answers"}</button>
            <button onClick={askAi} disabled={asking} className="btn-secondary">{asking ? "Asking AI…" : "Suggest more questions (AI)"}</button>
            <button onClick={() => save("checklist")} disabled={saving} className="btn-primary">Save &amp; go to checklist builder →</button>
          </>
        ) : null}
        <button onClick={() => router.push(`${basePath}/${id}` as never)} className="btn-secondary">Back to {label.toLowerCase()}</button>
      </div>
    </div>
  );
}
