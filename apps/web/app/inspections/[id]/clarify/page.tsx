"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Q = { id: string; question: string; type: "text" | "choice" | "number"; options?: string[]; required?: boolean };

export default function InspectionClarifyPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const router = useRouter();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/clarify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: id }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.questions ?? data.clarifyQuestions)?.length) {
          const qs = (data.questions ?? data.clarifyQuestions) as Q[];
          setQuestions(qs.map((q, i) => ({ id: q.id ?? `q${i}`, question: q.question, type: q.type ?? "text", options: q.options, required: q.required ?? false })));
        } else {
          setQuestions([
            { id: "q1", question: "Inspection scope / standard to check against? (unknown if not available)", type: "text" },
            { id: "q2", question: "Existing system — what do you know? (unknown if not available)", type: "text" },
            { id: "q3", question: "Access constraints or follow-up checks needed?", type: "text" },
          ]);
          if (!res.ok) setError((data as { error?: string }).error ?? "AI unavailable — using manual continuation (fallback).");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function save(next: "stay" | "checklist") {
    setSaving(true);
    try {
      const res = await fetch(`/api/assessments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { clarificationAnswers: answers } }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Save failed");
      }
      if (next === "checklist") router.push(`/inspections/${id}/checklist-builder`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl py-10 text-sm text-slate-500">Loading clarification questions…</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inspection clarification</h1>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">{id.slice(0, 8)} · {questions.length} questions</span>
      </div>
      <p className="text-sm text-slate-600">Answer or choose “Unknown / Not available” — unknown is preserved and never converted into an invented fact.</p>
      {error ? <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
      <div className="space-y-3">
        {questions.map((q) => (
          <label key={q.id} className="card p-4 block space-y-2">
            <div className="text-sm font-medium">{q.question} {q.required ? <span className="text-red-600">*</span> : <span className="text-xs text-slate-500">(optional — “Unknown” allowed)</span>}</div>
            {q.type === "choice" && q.options?.length ? (
              <select value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className="w-full rounded border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select — or type Unknown</option>
                {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                <option value="unknown">Unknown / Not available</option>
              </select>
            ) : (
              <input value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder={q.type === "number" ? "Enter number or Unknown" : "Type answer or Unknown"} className="w-full rounded border border-slate-200 px-3 py-2 text-sm" />
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => save("stay")} disabled={saving} className="btn-secondary">{saving ? "Saving…" : "Save answers"}</button>
        <button onClick={() => save("checklist")} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save & go to Checklist Builder →"}</button>
        <button onClick={() => router.push(`/inspections/${id}`)} className="btn-secondary">Back to inspection</button>
      </div>
    </div>
  );
}
