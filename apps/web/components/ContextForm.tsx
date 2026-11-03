"use client";
import { useState } from "react";
import { SCENARIOS, SCENARIO_LIST, scenarioLabel, type Scenario } from "@eval-ai/shared";

type Props = {
  assessmentId: string;
  pack: "solar" | "cctv";
  mode: "assessment" | "inspection";
  initial?: { siteName?: string; goal?: string; existingEquipment?: string; constraints?: string };
  /** New installation or existing system; null = not set yet (older assessments). */
  scenario?: Scenario | null;
  onSaved?: () => void;
};

export function ContextForm({ assessmentId, pack, mode, initial, scenario: scenarioProp = null, onSaved }: Props): JSX.Element {
  const [scenario, setScenario] = useState<Scenario | null>(scenarioProp);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const wording = SCENARIOS[scenario ?? "existing"];

  async function chooseScenario(next: Scenario) {
    setScenarioError(null);
    const res = await fetch(`/api/assessments/${assessmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { scenario: next } }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) setScenario(next);
    else setScenarioError(data.error ?? "Could not save the situation");
  }

  const [siteName, setSiteName] = useState(initial?.siteName ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [existing, setExisting] = useState(initial?.existingEquipment ?? "");
  const [constraints, setConstraints] = useState(initial?.constraints ?? "");
  const [saving, setSaving] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [questions, setQuestions] = useState<Array<{ id: string; question: string; required?: boolean }>>([]);

  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setSaveMessage(null);
    try {
      // An empty site name is left out (the server wants at least 2 characters and keeps the saved one).
      const res = await fetch(`/api/assessments/${assessmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(siteName.trim().length >= 2 ? { siteName: siteName.trim() } : {}), context: { goal, existingEquipment: existing, constraints } }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the context");
      setSaveMessage({ ok: true, text: "Saved." });
      onSaved?.();
    } catch (e) {
      setSaveMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
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
        body: JSON.stringify({ assessmentId, pack, mode, context: { siteName, goal, existing, constraints, scenario: mode === "inspection" ? "existing" : scenario } }),
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
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">Pack: {pack} — Mode: {mode} — Situation: {scenarioLabel(mode === "inspection" ? "existing" : scenario)}</div>
      </div>
      {mode === "assessment" && scenario === null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-900">What&apos;s the situation at the site?</div>
          <p className="text-xs text-amber-800">This can be set once. It tells the app and the AI whether to survey for a new installation or check what is already there.</p>
          <div className="mt-2 flex gap-2">
            {SCENARIO_LIST.map((s) => (
              <button key={s.id} type="button" onClick={() => void chooseScenario(s.id)} className="btn-secondary text-xs">{s.label}</button>
            ))}
          </div>
          {scenarioError && <p role="alert" className="mt-2 text-xs text-red-700">{scenarioError}</p>}
        </div>
      )}
      <label className="block text-sm">Goal / scope<textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder={wording.goalPlaceholder} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">{wording.equipmentLabel}<textarea value={existing} onChange={(e) => setExisting(e.target.value)} rows={2} placeholder={wording.equipmentPlaceholder} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <label className="block text-sm">Constraints<textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={2} placeholder="Access, wiring, roof, network, power, cabling" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary text-xs">{saving ? "Saving…" : "Save context (draft)"}</button>
        <button onClick={clarify} disabled={clarifying} className="btn-secondary text-xs">{clarifying ? "Asking…" : "Request clarification"}</button>
      </div>
      {saveMessage ? <p role={saveMessage.ok ? "status" : "alert"} className={`text-xs ${saveMessage.ok ? "text-green-700" : "text-red-700"}`}>{saveMessage.text}</p> : null}
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
