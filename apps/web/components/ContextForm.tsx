"use client";
import { useState } from "react";

type Props = {
  assessmentId: string;
  pack: "solar" | "cctv";
  mode: "assessment" | "inspection";
  initial?: { siteName?: string; goal?: string; existingEquipment?: string; constraints?: string };
  onSaved?: () => void;
};

export function ContextForm({ assessmentId, pack, mode, initial, onSaved }: Props): JSX.Element {
  const [siteName, setSiteName] = useState(initial?.siteName ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [existing, setExisting] = useState(initial?.existingEquipment ?? "");
  const [constraints, setConstraints] = useState(initial?.constraints ?? "");
  const [saving, setSaving] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [questions, setQuestions] = useState<Array<{ id: string; question: string; required?: boolean }>>([]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/assessments/${assessmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteName, context: { goal, existingEquipment: existing, constraints } }),
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function clarify() {
    setClarifying(true);
    try {
      const res = await fetch("/api/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, pack, mode, context: { siteName, goal, existing, constraints } }),
      });
      const data = await res.json();
      if (data.questions) setQuestions(data.questions);
      else setQuestions([{ id: "fallback", question: data.error ? `Clarification unavailable: ${data.error} — continue manually` : "No questions — context looks complete for the checklist." }]);
    } catch (e) {
      setQuestions([{ id: "err", question: `Clarification failed: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setClarifying(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Context — before the checklist</h3>
      <p className="text-xs text-slate-500">Share site details first. Clarification only asks when missing info would affect the checklist or safety — unknown stays unknown.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Site name<input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. 12 Acacia Rd" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Pack: {pack} — Mode: {mode}</div>
      </div>
      <label className="block text-sm">Goal / scope<textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={pack === "solar" ? "New/existing/upgrade/repair — load, usage, requested outcome" : "Coverage goals, existing system, retention"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Existing equipment<textarea value={existing} onChange={(e) => setExisting(e.target.value)} rows={2} placeholder="Inventory already on site" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Constraints<textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={2} placeholder="Access, wiring, roof, network, power, cabling" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : "Save context (draft)"}</button>
        <button onClick={clarify} disabled={clarifying} className="btn-secondary text-xs">{clarifying ? "Asking…" : "Request clarification"}</button>
      </div>
      {questions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-medium text-amber-900">Clarification — answer what you can, &ldquo;I don&apos;t know&rdquo; is fine</div>
          <ul className="mt-2 space-y-2">
            {questions.map((q) => (
              <li key={q.id} className="text-sm">
                <span className="font-medium">{q.question}</span>
                {q.required && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">required</span>}
                <input placeholder="Answer or I don't know" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">Save keeps a draft you can resume later. Clarification is on request — helpful questions, never auto-filled answers.</p>
    </div>
  );
}
