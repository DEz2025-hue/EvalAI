"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FORMULAS, LENGTH_UNITS, calculateMeasurement, type FormulaId, type LengthUnit, type MeasurementInput } from "@eval-ai/shared";
import { useRole } from "./useRole";

type Saved = { id: string; name: string; formula: string; method?: string; inputs: Record<string, { value: number; unit: string }>; value: number; unit: string; itemId: string | null; note?: string };
type Item = { id: string; title: string };

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e4) / 1e4) : "—");

/**
 * Recorded measurements: the formula, the inputs (with units) and the result are saved, and the result is
 * computed deterministically — never typed in by AI. Manual tape readings are stored as "manual entry".
 */
export function MeasurementsPanel({ assessmentId }: { assessmentId: string }): JSX.Element {
  const { canWrite, loaded } = useRole();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [formula, setFormula] = useState<FormulaId | "manual">("area");
  const [name, setName] = useState("");
  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, { value: string; unit: LengthUnit | "ratio" }>>({});
  const [manual, setManual] = useState({ value: "", unit: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([fetch(`/api/measurements?assessmentId=${assessmentId}`), fetch(`/api/checklist/items?assessmentId=${assessmentId}`)]);
      if (m.ok) setSaved(((await m.json()) as { measurements?: Saved[] }).measurements ?? []);
      else setError(((await m.json().catch(() => ({}))) as { error?: string }).error ?? "Could not load measurements");
      if (i.ok) setItems(((await i.json()) as { items?: Item[] }).items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const def = formula === "manual" ? null : FORMULAS[formula];

  const inputs: Record<string, MeasurementInput> | null = useMemo(() => {
    if (!def) return null;
    const out: Record<string, MeasurementInput> = {};
    for (const spec of def.inputs) {
      const v = values[spec.key];
      out[spec.key] = { value: v?.value === undefined || v.value === "" ? NaN : Number(v.value), unit: v?.unit ?? spec.defaultUnit };
      if (spec.kind === "ratio" && (v?.value === undefined || v.value === "")) out[spec.key].value = spec.defaultValue ?? NaN;
    }
    return out;
  }, [def, values]);

  const preview = useMemo(() => {
    if (!def || !inputs) return { ok: false as const, text: "" };
    try {
      const r = calculateMeasurement(def.id, inputs);
      return { ok: true as const, text: `${fmt(r.value)} ${r.unit}`, method: r.method };
    } catch (e) {
      return { ok: false as const, text: e instanceof Error ? e.message : "Enter all values" };
    }
  }, [def, inputs]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body =
        formula === "manual"
          ? { assessmentId, name, formula, itemId: itemId || null, value: Number(manual.value), unit: manual.unit, note: note || undefined }
          : { assessmentId, name, formula, itemId: itemId || null, inputs, note: note || undefined };
      const res = await fetch("/api/measurements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save measurement");
      setName("");
      setNote("");
      setValues({});
      setManual({ value: "", unit: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/measurements?assessmentId=${assessmentId}&id=${id}`, { method: "DELETE" });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not delete");
    else await load();
  }

  const canSave = canWrite && !busy && name.trim().length > 0 && (formula === "manual" ? manual.value !== "" && Number.isFinite(Number(manual.value)) && manual.unit.trim() !== "" : preview.ok);

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Measurements &amp; calculations</h3>
      <p className="text-xs text-slate-500">Each measurement keeps its formula, inputs and units so the number can be traced. Results are calculated here — never by AI, and never from a photo.</p>
      {error ? <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {loaded && !canWrite ? <p className="text-xs text-slate-500">Your role is read-only — you can view saved measurements.</p> : (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">How was it obtained?
              <select value={formula} onChange={(e) => { setFormula(e.target.value as FormulaId | "manual"); setValues({}); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                {Object.values(FORMULAS).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                <option value="manual">Manual reading (as measured on site)</option>
              </select>
            </label>
            <label className="text-sm">Name *
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="e.g. North roof area" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>

          {def ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {def.inputs.map((spec) => (
                <label key={spec.key} className="text-sm">{spec.label}
                  <div className="mt-1 flex gap-1">
                    <input type="number" inputMode="decimal" step="any" value={values[spec.key]?.value ?? (spec.kind === "ratio" ? String(spec.defaultValue ?? "") : "")} onChange={(e) => setValues((v) => ({ ...v, [spec.key]: { value: e.target.value, unit: v[spec.key]?.unit ?? spec.defaultUnit } }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    {spec.kind === "length" ? (
                      <select aria-label={`${spec.label} unit`} value={values[spec.key]?.unit ?? spec.defaultUnit} onChange={(e) => setValues((v) => ({ ...v, [spec.key]: { value: v[spec.key]?.value ?? "", unit: e.target.value as LengthUnit } }))} className="rounded-lg border border-slate-200 bg-white px-2 text-sm">
                        {LENGTH_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Value<input type="number" inputMode="decimal" step="any" value={manual.value} onChange={(e) => setManual({ ...manual, value: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-sm">Unit<input value={manual.unit} onChange={(e) => setManual({ ...manual, unit: e.target.value })} maxLength={20} placeholder="e.g. V, A, kW, m" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
          )}

          {def ? (
            <p className={`rounded-lg border px-3 py-2 text-sm ${preview.ok ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              {preview.ok ? <>Result: <strong>{preview.text}</strong> <span className="text-xs text-slate-500">({def.method})</span></> : preview.text || "Enter the values above"}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Checklist item (optional)
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Whole job</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
              </select>
            </label>
            <label className="text-sm">Note<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          </div>
          <button onClick={save} disabled={!canSave} className="btn-primary text-xs">{busy ? "Saving…" : "Save measurement"}</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="text-left p-2">Name</th><th className="text-left p-2">Value</th><th className="text-left p-2">How</th><th className="p-2" /></tr></thead>
          <tbody>
            {saved.length === 0 ? <tr><td colSpan={4} className="p-3 text-center text-xs text-slate-500">No measurements recorded yet.</td></tr> : null}
            {saved.map((m) => (
              <tr key={m.id} className="border-t border-slate-100 align-top">
                <td className="p-2">{m.name}{m.itemId ? <span className="ml-1 text-xs text-slate-500">· {items.find((i) => i.id === m.itemId)?.title ?? "item"}</span> : null}</td>
                <td className="p-2 whitespace-nowrap">{fmt(m.value)} {m.unit}</td>
                <td className="p-2 text-xs text-slate-600">{m.method ?? m.formula}{m.formula !== "manual" ? <div className="text-slate-500">{Object.entries(m.inputs ?? {}).map(([k, v]) => `${k}: ${v.value}${v.unit === "ratio" ? "" : " " + v.unit}`).join(" · ")}</div> : null}</td>
                <td className="p-2 text-right">{canWrite ? <button onClick={() => remove(m.id)} className="text-xs text-red-600 hover:underline">Delete</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
