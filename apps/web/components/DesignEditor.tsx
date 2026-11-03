"use client";
import type { ReactNode } from "react";
import { CAMERA_TYPES, CAMERA_TYPE_LABEL, DECISION_BASES, DECISION_BASIS_LABEL, DESIGN_LIMITS, DORI_LABEL, DORI_LEVELS, SYSTEM_RANGES, cameraFix, cctvSizing, designCounts, systemOf, type CctvSystem, type DesignArea, type DesignProposal } from "@eval-ai/shared";

const INPUT = "min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm";
const L = DESIGN_LIMITS;

/** A list of short lines edited as one text box, one line each. */
function LinesField({ label, hint, value, max, onChange }: { label: string; hint?: string; value: string[]; max: number; onChange: (v: string[]) => void }): JSX.Element {
  return (
    <label className="block text-xs font-medium text-slate-700">{label}
      <textarea value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n").slice(0, max))} rows={Math.min(Math.max(value.length, 2), 8)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-normal" />
      {hint ? <span className="font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

/** A small table of rows with add and remove. `cells` draws one row's inputs. */
function Rows<T>({ label, value, max, blank, onChange, cells }: { label: string; value: T[]; max: number; blank: T; onChange: (v: T[]) => void; cells: (row: T, set: (p: Partial<T>) => void, i: number) => ReactNode }): JSX.Element {
  const set = (i: number) => (p: Partial<T>) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-700">{label}</div>
        <button type="button" onClick={() => onChange([...value, { ...blank }])} disabled={value.length >= max} className="btn-secondary text-xs">Add</button>
      </div>
      {value.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          {cells(r, set(i), i)}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} row ${i + 1}`} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Remove</button>
        </div>
      ))}
    </div>
  );
}

/**
 * Edit a design proposal (D-034): the decisions it rests on, the camera schedule area by area, the coverage options, the equipment and
 * what is still open. Camera totals are counted from the schedule, so they always match what is listed.
 */
export function DesignEditor({ value, onChange }: { value: DesignProposal; onChange: (next: DesignProposal) => void }): JSX.Element {
  const d = value;
  const set = (p: Partial<DesignProposal>) => onChange({ ...d, ...p });
  const setArea = (i: number, p: Partial<DesignArea>) => set({ areas: d.areas.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const counts = designCounts(d);
  // The system sizing (D-037), worked out by the app from exactly what is in the editor, so a moved camera or a changed setting shows at once.
  const z = cctvSizing(d);
  const sys = systemOf(d);
  const setSystem = (p: Partial<CctvSystem>) => set({ system: { ...sys, ...p } });
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-3">
      <div>
        <div className="text-sm font-medium">Design proposal</div>
        <p className="text-xs text-slate-500">
          {counts.total} camera{counts.total === 1 ? "" : "s"} in {counts.byArea.length} area{counts.byArea.length === 1 ? "" : "s"}
          {counts.optionalExtra ? ` · ${counts.optionalExtra} more in the options` : ""}. The AI proposed this from your record: move, add or remove cameras, and correct every decision marked Assumption with the client.
        </p>
      </div>

      <Rows label="Design basis" value={d.basis} max={L.basis} blank={{ item: "", decision: "", basis: "client" as const }} onChange={(basis) => set({ basis })} cells={(r, s) => (
        <>
          <input aria-label="Decision topic" value={r.item} onChange={(e) => s({ item: e.target.value })} maxLength={L.short} placeholder="Topic" className={`${INPUT} w-36`} />
          <input aria-label="Decision" value={r.decision} onChange={(e) => s({ decision: e.target.value })} maxLength={L.text} placeholder="Decision" className={`${INPUT} flex-1`} />
          <select aria-label="Where the decision comes from" value={r.basis} onChange={(e) => s({ basis: e.target.value as typeof r.basis })} className={`${INPUT} bg-white text-xs`}>
            {DECISION_BASES.map((b) => <option key={b} value={b}>{DECISION_BASIS_LABEL[b]}</option>)}
          </select>
        </>
      )} />

      <LinesField label="Design approach" hint="One rule per line." value={d.approach} max={L.approach} onChange={(approach) => set({ approach })} />

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
        <div className="text-xs font-medium text-slate-700">System sizing (worked out by the app as you edit)</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            ["Bandwidth", `${Math.round(z.bandwidthMbps * 10) / 10} Mbps`],
            ["Storage", `${Math.round(z.storageWithHeadroomTb * 10) / 10} TB`],
            ["Drives", `${z.drives} × ${sys.driveTb.value} TB`],
            ["Recorder", `${z.recorderChannels} ch`],
            ["PoE", `${z.poeTotalW} W`],
            ["UPS", `${z.upsVa} VA`],
          ].map(([label, v]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <div className="text-[11px] text-slate-500">{label}</div>
              <div className="text-sm font-semibold">{v}</div>
            </div>
          ))}
        </div>
        {z.failing.length ? (
          <ul className="space-y-1 text-xs text-amber-800">
            {z.failing.map((c) => <li key={c.id}><strong>{c.id}</strong> {cameraFix(c)}</li>)}
          </ul>
        ) : (
          <p className="text-xs text-green-800">Every camera gives the detail it needs at its distance.</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">Codec
            <select value={sys.codec} onChange={(e) => setSystem({ codec: e.target.value as CctvSystem["codec"] })} className={`${INPUT} bg-white text-xs`}>
              <option value="h265">H.265</option>
              <option value="h264">H.264</option>
            </select>
          </label>
          <label className="flex items-center gap-1">Recording
            <select value={sys.recording} onChange={(e) => setSystem({ recording: e.target.value as CctvSystem["recording"] })} className={`${INPUT} bg-white text-xs`}>
              <option value="motion">On motion</option>
              <option value="continuous">Continuous</option>
            </select>
          </label>
        </div>
        {(Object.keys(SYSTEM_RANGES) as Array<keyof typeof SYSTEM_RANGES>).filter((k) => k !== "motionShare" || sys.recording === "motion").map((k) => {
          const r = SYSTEM_RANGES[k];
          const v = sys[k];
          return (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              <span className="w-56 text-xs">{r.label}</span>
              <input aria-label={r.label} type="number" min={r.min} max={r.max} step={r.max <= 1 ? 0.05 : r.max <= 5 ? 0.1 : 1} value={v.value} onChange={(e) => setSystem({ [k]: { ...v, value: Math.min(r.max, Math.max(r.min, Number(e.target.value) || r.min)) } })} className={`${INPUT} w-20`} />
              <span className="w-20 text-xs text-slate-500">{r.unit}</span>
              <select aria-label={`${r.label} basis`} value={v.basis} onChange={(e) => setSystem({ [k]: { ...v, basis: e.target.value as typeof v.basis } })} className={`${INPUT} bg-white text-xs`}>
                {DECISION_BASES.map((b) => <option key={b} value={b}>{DECISION_BASIS_LABEL[b]}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-700">Camera plans, by area</div>
          <button type="button" onClick={() => set({ areas: [...d.areas, { name: "New area", cameras: [], uncovered: [], notes: [] }] })} disabled={d.areas.length >= L.areas} className="btn-secondary text-xs">Add an area</button>
        </div>
        {d.areas.map((a, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
            <div className="flex items-center gap-2">
              <input aria-label={`Area ${i + 1} name`} value={a.name} onChange={(e) => setArea(i, { name: e.target.value })} maxLength={L.short} className={`${INPUT} flex-1 font-medium`} />
              <span className="text-xs text-slate-500">{a.cameras.length} camera{a.cameras.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => set({ areas: d.areas.filter((_, j) => j !== i) })} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Remove area</button>
            </div>
            <Rows label="Cameras" value={a.cameras} max={L.camerasPerArea} blank={{ id: "", location: "", type: "indoor_dome" as const, purpose: "" }} onChange={(cameras) => setArea(i, { cameras })} cells={(c, s) => (
              <>
                <input aria-label="Camera ID" value={c.id} onChange={(e) => s({ id: e.target.value })} maxLength={L.id} placeholder="ID" className={`${INPUT} w-16`} />
                <input aria-label="Camera location" value={c.location} onChange={(e) => s({ location: e.target.value })} maxLength={L.short} placeholder="Location" className={`${INPUT} flex-1`} />
                <select aria-label="Camera type" value={c.type} onChange={(e) => s({ type: e.target.value as typeof c.type })} className={`${INPUT} bg-white text-xs`}>
                  {CAMERA_TYPES.map((t) => <option key={t} value={t}>{CAMERA_TYPE_LABEL[t]}</option>)}
                </select>
                <input aria-label="Camera purpose" value={c.purpose} onChange={(e) => s({ purpose: e.target.value })} maxLength={L.short} placeholder="What it watches" className={`${INPUT} flex-1`} />
                <select aria-label="Detail needed" value={c.detail ?? ""} onChange={(e) => s({ detail: (e.target.value || undefined) as typeof c.detail })} className={`${INPUT} bg-white text-xs`}>
                  <option value="">Detail…</option>
                  {DORI_LEVELS.map((l) => <option key={l} value={l}>{DORI_LABEL[l]}</option>)}
                </select>
                <input aria-label="Distance to target, metres" type="number" min={0.5} step={0.5} value={c.distanceM ?? ""} onChange={(e) => s({ distanceM: num(e.target.value) })} placeholder="m" className={`${INPUT} w-14`} />
                <input aria-label="Megapixels" type="number" min={1} step={1} value={c.megapixels ?? ""} onChange={(e) => s({ megapixels: num(e.target.value) })} placeholder="MP" className={`${INPUT} w-14`} />
                <input aria-label="Angle of view, degrees" type="number" min={5} max={180} step={5} value={c.fovDeg ?? ""} onChange={(e) => s({ fovDeg: num(e.target.value) })} placeholder="°" className={`${INPUT} w-14`} />
                {(() => {
                  const k = z.cameras.find((x) => x.id === c.id);
                  return k ? <span title={cameraFix(k) || `${Math.round(k.pxPerM)} px/m`} className={`text-xs ${k.meets ? "text-green-700" : "text-amber-700"}`}>{k.meets ? "✓" : "⚠"} {Math.round(k.pxPerM)} px/m</span> : null;
                })()}
              </>
            )} />
            <LinesField label="No camera inside" hint="One per line: room or space - reason." value={a.uncovered} max={L.uncovered} onChange={(uncovered) => setArea(i, { uncovered })} />
            <LinesField label="Notes under the schedule" value={a.notes} max={L.notes} onChange={(notes) => setArea(i, { notes })} />
          </div>
        ))}
      </div>

      <Rows label="Coverage options (not in the count)" value={d.options} max={L.options} blank={{ area: "", gap: "", option: "", extraCameras: 1 }} onChange={(options) => set({ options })} cells={(o, s) => (
        <>
          <input aria-label="Option area" value={o.area} onChange={(e) => s({ area: e.target.value })} maxLength={L.short} placeholder="Area" className={`${INPUT} w-32`} />
          <input aria-label="Coverage gap" value={o.gap} onChange={(e) => s({ gap: e.target.value })} maxLength={L.text} placeholder="Gap" className={`${INPUT} flex-1`} />
          <input aria-label="Option" value={o.option} onChange={(e) => s({ option: e.target.value })} maxLength={L.short} placeholder="Option" className={`${INPUT} w-40`} />
          <input aria-label="Extra cameras" type="number" min={0} max={99} value={o.extraCameras} onChange={(e) => s({ extraCameras: Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))) })} className={`${INPUT} w-16`} />
        </>
      )} />

      <Rows label="Equipment (cameras are counted from the schedule)" value={d.equipment} max={L.equipment} blank={{ item: "", quantity: "", specification: "" }} onChange={(equipment) => set({ equipment })} cells={(r, s) => (
        <>
          <input aria-label="Equipment item" value={r.item} onChange={(e) => s({ item: e.target.value })} maxLength={L.short} placeholder="Item" className={`${INPUT} w-40`} />
          <input aria-label="Quantity" value={r.quantity} onChange={(e) => s({ quantity: e.target.value })} maxLength={40} placeholder="Qty" className={`${INPUT} w-28`} />
          <input aria-label="Specification" value={r.specification} onChange={(e) => s({ specification: e.target.value })} maxLength={L.text} placeholder="Specification" className={`${INPUT} flex-1`} />
        </>
      )} />

      <LinesField label="Installation approach" hint="One phase per line." value={d.installation} max={L.installation} onChange={(installation) => set({ installation })} />

      <Rows label="Assumptions and open items" value={d.openItems} max={L.openItems} blank={{ item: "", status: "To be confirmed" }} onChange={(openItems) => set({ openItems })} cells={(r, s) => (
        <>
          <input aria-label="Open item" value={r.item} onChange={(e) => s({ item: e.target.value })} maxLength={L.text} placeholder="Assumption or open item" className={`${INPUT} flex-1`} />
          <input aria-label="Status" value={r.status} onChange={(e) => s({ status: e.target.value })} maxLength={60} placeholder="Status" className={`${INPUT} w-44`} />
        </>
      )} />

      <LinesField label="Next steps" hint="One step per line." value={d.nextSteps} max={L.nextSteps} onChange={(nextSteps) => set({ nextSteps })} />
    </div>
  );
}
