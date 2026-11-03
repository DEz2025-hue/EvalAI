"use client";
import type { ReactNode } from "react";
import { DECISION_BASES, DECISION_BASIS_LABEL, LOAD_SOURCES, LOAD_SOURCE_LABEL, SIZING_RANGES, SOLAR_LIMITS, SYSTEM_TYPES, SYSTEM_TYPE_LABEL, kilo, solarSizing, type SolarDesign, type SolarInputs } from "@eval-ai/shared";

const INPUT = "min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm";
const L = SOLAR_LIMITS;

function LinesField({ label, hint, value, max, onChange }: { label: string; hint?: string; value: string[]; max: number; onChange: (v: string[]) => void }): JSX.Element {
  return (
    <label className="block text-xs font-medium text-slate-700">{label}
      <textarea value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n").slice(0, max))} rows={Math.min(Math.max(value.length, 2), 8)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
      {hint ? <span className="font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Rows<T>({ label, value, max, blank, onChange, cells }: { label: string; value: T[]; max: number; blank: T; onChange: (v: T[]) => void; cells: (row: T, set: (p: Partial<T>) => void) => ReactNode }): JSX.Element {
  const set = (i: number) => (p: Partial<T>) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-700">{label}</div>
        <button type="button" onClick={() => onChange([...value, { ...blank }])} disabled={value.length >= max} className="btn-secondary text-xs">Add</button>
      </div>
      {value.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          {cells(r, set(i))}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} row ${i + 1}`} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Remove</button>
        </div>
      ))}
    </div>
  );
}

const n = (v: string) => (v.trim() === "" ? 0 : Number(v));

/**
 * Edit a solar design (D-036): the load schedule, the sizing inputs and the rest of the proposal. The sizing at the top is worked out by the app
 * as you type, from exactly what is in the editor, so a changed load or assumption shows its effect straight away.
 */
export function SolarDesignEditor({ value, onChange }: { value: SolarDesign; onChange: (next: SolarDesign) => void }): JSX.Element {
  const d = value;
  const set = (p: Partial<SolarDesign>) => onChange({ ...d, ...p });
  const setInput = <K extends keyof SolarInputs>(k: K, v: SolarInputs[K]) => set({ inputs: { ...d.inputs, [k]: v } });
  // Loads being typed may be incomplete; size only the ones that can be sized.
  const s = solarSizing({ ...d, loads: d.loads.filter((l) => l.name.trim() && l.watts > 0) });

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-3">
      <div>
        <div className="text-sm font-medium">Solar design and sizing</div>
        <p className="text-xs text-slate-500">The AI drafted the loads and assumptions from your record; the sizes below are worked out by the app and update as you edit. Confirm every load marked Typical or Assumption with the client.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Daily need", kilo(s.dailyWh, "Wh")],
          ["Array", `${kilo(s.arrayWp, "Wp")} · ${s.panelCount} panels`],
          ["Inverter", kilo(s.inverterW, "W")],
          ["Surge", kilo(s.surgeW, "W")],
          ["Battery", s.batteryNominalWh > 0 ? kilo(s.batteryNominalWh, "Wh") : "None"],
        ].map(([label, v]) => (
          <div key={label} className="rounded-lg border border-slate-200 px-2 py-1.5">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <Rows label="Load schedule" value={d.loads} max={L.loads} blank={{ name: "", quantity: 1, watts: 0, hoursPerDay: 0, source: "client" as const, motor: false, note: "" }} onChange={(loads) => set({ loads })} cells={(l, u) => (
        <>
          <input aria-label="Load name" value={l.name} onChange={(e) => u({ name: e.target.value })} maxLength={L.short} placeholder="Appliance" className={`${INPUT} w-44 flex-1`} />
          <input aria-label="Quantity" type="number" min={1} value={l.quantity} onChange={(e) => u({ quantity: Math.max(1, Math.round(n(e.target.value))) })} className={`${INPUT} w-14`} />
          <input aria-label="Watts each" type="number" min={0} value={l.watts} onChange={(e) => u({ watts: Math.max(0, n(e.target.value)) })} className={`${INPUT} w-20`} />
          <span className="text-xs text-slate-500">W</span>
          <input aria-label="Hours per day" type="number" min={0} max={24} step={0.5} value={l.hoursPerDay} onChange={(e) => u({ hoursPerDay: Math.min(24, Math.max(0, n(e.target.value))) })} className={`${INPUT} w-16`} />
          <span className="text-xs text-slate-500">h/day</span>
          <select aria-label="Where the figure came from" value={l.source} onChange={(e) => u({ source: e.target.value as typeof l.source })} className={`${INPUT} bg-white text-xs`}>
            {LOAD_SOURCES.map((x) => <option key={x} value={x}>{LOAD_SOURCE_LABEL[x]}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.motor} onChange={(e) => u({ motor: e.target.checked })} /> surge</label>
        </>
      )} />

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-700">Sizing inputs</div>
        <label className="flex items-center gap-2 text-xs">System type
          <select value={d.inputs.systemType} onChange={(e) => setInput("systemType", e.target.value as SolarInputs["systemType"])} className={`${INPUT} bg-white text-xs`}>
            {SYSTEM_TYPES.map((t) => <option key={t} value={t}>{SYSTEM_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        {(Object.keys(SIZING_RANGES) as Array<keyof typeof SIZING_RANGES>).map((k) => {
          const r = SIZING_RANGES[k];
          const v = d.inputs[k];
          return (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              <span className="w-44 text-xs">{r.label}</span>
              <input aria-label={r.label} type="number" min={r.min} max={r.max} step={r.max <= 1 ? 0.05 : r.max <= 8 ? 0.1 : 1} value={v.value} onChange={(e) => setInput(k, { ...v, value: Math.min(r.max, Math.max(r.min, n(e.target.value))) })} className={`${INPUT} w-20`} />
              <span className="w-10 text-xs text-slate-500">{r.unit}</span>
              <select aria-label={`${r.label} basis`} value={v.basis} onChange={(e) => setInput(k, { ...v, basis: e.target.value as typeof v.basis })} className={`${INPUT} bg-white text-xs`}>
                {DECISION_BASES.map((b) => <option key={b} value={b}>{DECISION_BASIS_LABEL[b]}</option>)}
              </select>
              <input aria-label={`${r.label} note`} value={v.note} onChange={(e) => setInput(k, { ...v, note: e.target.value })} maxLength={L.short} placeholder="Note" className={`${INPUT} flex-1`} />
            </div>
          );
        })}
      </div>

      <Rows label="Design basis" value={d.basis} max={L.basis} blank={{ item: "", decision: "", basis: "client" as const }} onChange={(basis) => set({ basis })} cells={(r, u) => (
        <>
          <input aria-label="Decision topic" value={r.item} onChange={(e) => u({ item: e.target.value })} maxLength={L.short} placeholder="Topic" className={`${INPUT} w-36`} />
          <input aria-label="Decision" value={r.decision} onChange={(e) => u({ decision: e.target.value })} maxLength={L.text} placeholder="Decision" className={`${INPUT} flex-1`} />
          <select aria-label="Where the decision comes from" value={r.basis} onChange={(e) => u({ basis: e.target.value as typeof r.basis })} className={`${INPUT} bg-white text-xs`}>
            {DECISION_BASES.map((b) => <option key={b} value={b}>{DECISION_BASIS_LABEL[b]}</option>)}
          </select>
        </>
      )} />

      <LinesField label="Panel placement" hint="One line each: where and why." value={d.placement} max={L.placement} onChange={(placement) => set({ placement })} />

      <Rows label="Options for the client" value={d.options} max={L.options} blank={{ area: "", gap: "", option: "", extraCameras: 0 }} onChange={(options) => set({ options })} cells={(o, u) => (
        <>
          <input aria-label="Topic" value={o.area} onChange={(e) => u({ area: e.target.value })} maxLength={L.short} placeholder="Topic" className={`${INPUT} w-32`} />
          <input aria-label="Choice" value={o.gap} onChange={(e) => u({ gap: e.target.value })} maxLength={L.text} placeholder="Choice" className={`${INPUT} flex-1`} />
          <input aria-label="What it would change" value={o.option} onChange={(e) => u({ option: e.target.value })} maxLength={L.short} placeholder="What it would change" className={`${INPUT} flex-1`} />
        </>
      )} />

      <Rows label="Other equipment (panels, inverter and battery come from the sizing)" value={d.equipment} max={L.equipment} blank={{ item: "", quantity: "", specification: "" }} onChange={(equipment) => set({ equipment })} cells={(r, u) => (
        <>
          <input aria-label="Equipment item" value={r.item} onChange={(e) => u({ item: e.target.value })} maxLength={L.short} placeholder="Item" className={`${INPUT} w-40`} />
          <input aria-label="Quantity" value={r.quantity} onChange={(e) => u({ quantity: e.target.value })} maxLength={40} placeholder="Qty" className={`${INPUT} w-28`} />
          <input aria-label="Specification" value={r.specification} onChange={(e) => u({ specification: e.target.value })} maxLength={L.text} placeholder="Specification" className={`${INPUT} flex-1`} />
        </>
      )} />

      <LinesField label="Installation approach" hint="One phase per line." value={d.installation} max={L.installation} onChange={(installation) => set({ installation })} />

      <Rows label="Assumptions and open items" value={d.openItems} max={L.openItems} blank={{ item: "", status: "To be confirmed" }} onChange={(openItems) => set({ openItems })} cells={(r, u) => (
        <>
          <input aria-label="Open item" value={r.item} onChange={(e) => u({ item: e.target.value })} maxLength={L.text} placeholder="Assumption or open item" className={`${INPUT} flex-1`} />
          <input aria-label="Status" value={r.status} onChange={(e) => u({ status: e.target.value })} maxLength={60} placeholder="Status" className={`${INPUT} w-44`} />
        </>
      )} />

      <LinesField label="Next steps" hint="One step per line." value={d.nextSteps} max={L.nextSteps} onChange={(nextSteps) => set({ nextSteps })} />
    </div>
  );
}
