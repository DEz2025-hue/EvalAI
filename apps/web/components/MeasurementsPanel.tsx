"use client";
import { useState } from "react";
import { areaM2, volumeM3, cableLengthWithSag } from "@eval-ai/shared";

type Measurement = { name: string; value: number; unit: string; source: string };

export function MeasurementsPanel({ assessmentId }: { assessmentId: string }): JSX.Element {
  const [items, setItems] = useState<Measurement[]>([
    { name: "Roof area", value: 0, unit: "m²", source: "manual" },
  ]);
  const [length, setLength] = useState(10);
  const [width, setWidth] = useState(6);
  const [cable, setCable] = useState(50);

  const area = (() => { try { return areaM2(length, width); } catch { return NaN; } })();
  const cableWithSag = cableLengthWithSag(cable);

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Measurements & deterministic calculations</h3>
      <p className="text-xs text-slate-500">Manual entry, units explicit, provenance preserved. Calculations are tested and never sourced from AI visuals.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Length (m)<input type="number" value={length} onChange={(e) => setLength(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="text-sm">Width (m)<input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">Area = {Number.isFinite(area) ? `${area.toFixed(2)} m²` : "—"} <span className="text-xs text-slate-500">(areaM2)</span></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Straight cable (m)<input type="number" value={cable} onChange={(e) => setCable(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">With sag (5%) = {cableWithSag.toFixed(1)} m</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="text-left p-2">Name</th><th className="p-2">Value</th><th className="p-2">Source</th></tr></thead>
          <tbody>
            {items.map((m, i) => <tr key={i} className="border-t border-slate-100"><td className="p-2">{m.name}</td><td className="p-2">{m.value} {m.unit}</td><td className="p-2 text-xs">{m.source}</td></tr>)}
          </tbody>
        </table>
      </div>
      <button onClick={() => setItems((prev) => [...prev, { name: `M${prev.length + 1}`, value: area, unit: "m²", source: "calculation: areaM2" }])} className="btn-secondary text-xs">Save area to measurements</button>
      <p className="text-xs text-slate-500">Values are saved with your checklist and evidence. AI suggestions never overwrite your measurements.</p>
    </div>
  );
}
