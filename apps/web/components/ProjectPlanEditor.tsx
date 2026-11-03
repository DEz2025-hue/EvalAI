"use client";
import { PROJECT_PLAN_LIMITS as L, projectPlanNote, type ProjectPlan, type ProjectPlanHold, type ProjectPlanPhase } from "@eval-ai/shared";

const input = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";

/** Edit the project plan in a draft (D-039): what to settle first, then the phases. Nothing is saved until the person presses Save edits. */
export function ProjectPlanEditor({ value, onChange }: { value: ProjectPlan; onChange: (plan: ProjectPlan) => void }): JSX.Element {
  const setHold = (i: number, patch: Partial<ProjectPlanHold>) => onChange({ ...value, holds: value.holds.map((h, x) => (x === i ? { ...h, ...patch } : h)) });
  const setPhase = (i: number, patch: Partial<ProjectPlanPhase>) => onChange({ ...value, phases: value.phases.map((p, x) => (x === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <div className="text-sm font-semibold">Project plan</div>
        <p className="text-xs text-slate-500">{projectPlanNote(value)}</p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-700">Settle these before work starts</div>
        {value.holds.length === 0 ? <p className="text-xs text-slate-500">Nothing listed.</p> : null}
        {value.holds.map((h, i) => (
          <div key={i} className="space-y-1 rounded border border-slate-200 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Title" value={h.title} maxLength={L.title} onChange={(e) => setHold(i, { title: e.target.value })} className={input + " flex-1 font-medium"} />
              <select aria-label="Priority" value={h.priority} onChange={(e) => setHold(i, { priority: e.target.value === "high" ? "high" : "medium" })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
              <button type="button" onClick={() => onChange({ ...value, holds: value.holds.filter((_, x) => x !== i) })} className="btn-secondary text-xs">Remove</button>
            </div>
            <label className="block text-xs">Why it matters
              <textarea value={h.why} maxLength={L.why} rows={2} onChange={(e) => setHold(i, { why: e.target.value })} className={input} />
            </label>
            <label className="block text-xs">What to do
              <textarea value={h.action} maxLength={L.action} rows={2} onChange={(e) => setHold(i, { action: e.target.value })} className={input} />
            </label>
          </div>
        ))}
        {value.holds.length < L.holds ? <button type="button" onClick={() => onChange({ ...value, holds: [...value.holds, { title: "New item", priority: "medium", why: "", action: "", basis: [] }] })} className="btn-secondary text-xs">Add an item</button> : null}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-700">How the project runs</div>
        {value.phases.map((p, i) => (
          <div key={i} className="space-y-1 rounded border border-slate-200 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{i + 1}.</span>
              <input aria-label="Phase name" value={p.name} maxLength={L.name} onChange={(e) => setPhase(i, { name: e.target.value })} className={input + " flex-1 font-medium"} />
              <button type="button" disabled={value.phases.length === 1} onClick={() => onChange({ ...value, phases: value.phases.filter((_, x) => x !== i) })} className="btn-secondary text-xs">Remove</button>
            </div>
            <label className="block text-xs">Goal
              <input value={p.goal} maxLength={L.goal} onChange={(e) => setPhase(i, { goal: e.target.value })} className={input} />
            </label>
            <label className="block text-xs">Tasks, one per line
              <textarea value={p.tasks.join("\n")} rows={Math.max(3, p.tasks.length)} onChange={(e) => setPhase(i, { tasks: e.target.value.split("\n").slice(0, L.tasks) })} className={input} />
            </label>
            <label className="block text-xs">Owner (a role)
              <input value={p.owner} maxLength={L.owner} onChange={(e) => setPhase(i, { owner: e.target.value })} className={input} />
            </label>
            <label className="block text-xs">Finished when
              <input value={p.doneWhen} maxLength={L.doneWhen} onChange={(e) => setPhase(i, { doneWhen: e.target.value })} className={input} />
            </label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.holdPoint} onChange={(e) => setPhase(i, { holdPoint: e.target.checked })} /> Hold point: sign off before the next phase</label>
          </div>
        ))}
        {value.phases.length < L.phases ? <button type="button" onClick={() => onChange({ ...value, phases: [...value.phases, { name: "New phase", goal: "", tasks: [], owner: "", doneWhen: "", holdPoint: false }] })} className="btn-secondary text-xs">Add a phase</button> : null}
      </div>
    </div>
  );
}
