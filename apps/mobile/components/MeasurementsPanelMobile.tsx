import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { FORMULAS, LENGTH_UNITS, calculateMeasurement, type FormulaId, type LengthUnit, type MeasurementInput } from "@eval-ai/shared";
import { apiFetch } from "../lib/api";
import { useRole } from "../lib/role";
import { ItemChips, type ChipItem } from "./ItemChips";

type Saved = { id: string; name: string; formula: string; method?: string; inputs: Record<string, { value: number; unit: string }>; value: number; unit: string; itemId: string | null };

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e4) / 1e4) : "—");
const box = { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 10 } as const;
const input = { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" } as const;

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? "#0ea5e9" : "#e2e8f0", backgroundColor: active ? "#e0f2fe" : "#fff" }}>
      <Text style={{ fontSize: 11, fontWeight: active ? "700" : "500", color: active ? "#0369a1" : "#334155" }}>{text}</Text>
    </Pressable>
  );
}

/**
 * Recorded measurements: formula, inputs (with units) and result are saved; the server computes the result.
 * Manual tape/meter readings are stored as "manual entry". Nothing here comes from AI or from a photo.
 */
export function MeasurementsPanelMobile({ assessmentId, items = [] }: { assessmentId: string; items?: ChipItem[] }) {
  const { canWrite, loaded } = useRole();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [formula, setFormula] = useState<FormulaId | "manual">("area");
  const [name, setName] = useState("");
  const [itemId, setItemId] = useState("");
  const [values, setValues] = useState<Record<string, { value: string; unit: LengthUnit | "ratio" }>>({});
  const [manual, setManual] = useState({ value: "", unit: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/measurements?assessmentId=" + assessmentId);
      const data = (await res.json().catch(() => ({}))) as { measurements?: Saved[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load measurements");
      setSaved(data.measurements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const def = formula === "manual" ? null : FORMULAS[formula];

  const inputs = useMemo(() => {
    if (!def) return null;
    const out: Record<string, MeasurementInput> = {};
    for (const spec of def.inputs) {
      const v = values[spec.key];
      const raw = v?.value;
      out[spec.key] = { value: raw === undefined || raw === "" ? (spec.kind === "ratio" ? spec.defaultValue ?? NaN : NaN) : Number(raw.replace(",", ".")), unit: v?.unit ?? spec.defaultUnit };
    }
    return out;
  }, [def, values]);

  const preview = useMemo(() => {
    if (!def || !inputs) return { ok: false as const, text: "" };
    try {
      const r = calculateMeasurement(def.id, inputs);
      return { ok: true as const, text: fmt(r.value) + " " + r.unit, method: r.method };
    } catch (e) {
      return { ok: false as const, text: e instanceof Error ? e.message : "Enter all values" };
    }
  }, [def, inputs]);

  const manualValue = Number(manual.value.replace(",", "."));
  const canSave = canWrite && !busy && name.trim().length > 0 && (formula === "manual" ? manual.value.trim() !== "" && Number.isFinite(manualValue) && manual.unit.trim() !== "" : preview.ok);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body =
        formula === "manual"
          ? { assessmentId, name: name.trim(), formula, itemId: itemId || null, value: manualValue, unit: manual.unit.trim() }
          : { assessmentId, name: name.trim(), formula, itemId: itemId || null, inputs };
      const res = await apiFetch("/api/measurements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save measurement");
      setName("");
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
    const res = await apiFetch("/api/measurements?assessmentId=" + assessmentId + "&id=" + id, { method: "DELETE" });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not delete");
    else await load();
  }

  return (
    <View style={box}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Measurements & calculations</Text>
      <Text style={{ fontSize: 11, color: "#64748b" }}>Each measurement keeps its formula, inputs and units. Results are calculated — never by AI or from a photo.</Text>
      {error ? <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 8 }}><Text style={{ fontSize: 12, color: "#b91c1c" }}>{error}</Text></View> : null}

      {loaded && !canWrite ? (
        <Text style={{ fontSize: 12, color: "#64748b" }}>Your role is read-only — you can view saved measurements.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Object.values(FORMULAS).map((f) => <Chip key={f.id} text={f.label.split(" (")[0]} active={formula === f.id} onPress={() => { setFormula(f.id); setValues({}); }} />)}
            <Chip text="Manual reading" active={formula === "manual"} onPress={() => { setFormula("manual"); setValues({}); }} />
          </View>
          <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. North roof area" placeholderTextColor="#94a3b8" maxLength={200} style={input} />

          {def ? (
            def.inputs.map((spec) => (
              <View key={spec.key} style={{ gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#0f172a" }}>{spec.label}</Text>
                <TextInput keyboardType="decimal-pad" value={values[spec.key]?.value ?? (spec.kind === "ratio" ? String(spec.defaultValue ?? "") : "")}
                  onChangeText={(t) => setValues((v) => ({ ...v, [spec.key]: { value: t, unit: v[spec.key]?.unit ?? spec.defaultUnit } }))} style={input} />
                {spec.kind === "length" ? (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {LENGTH_UNITS.map((u) => <Chip key={u} text={u} active={(values[spec.key]?.unit ?? spec.defaultUnit) === u} onPress={() => setValues((v) => ({ ...v, [spec.key]: { value: v[spec.key]?.value ?? "", unit: u } }))} />)}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput keyboardType="decimal-pad" value={manual.value} onChangeText={(t) => setManual({ ...manual, value: t })} placeholder="Value" placeholderTextColor="#94a3b8" style={[input, { flex: 1 }]} />
              <TextInput value={manual.unit} onChangeText={(t) => setManual({ ...manual, unit: t })} placeholder="Unit (V, A, kW…)" placeholderTextColor="#94a3b8" maxLength={20} style={[input, { flex: 1 }]} />
            </View>
          )}

          {def ? (
            <View style={{ backgroundColor: preview.ok ? "#f8fafc" : "#fffbeb", borderWidth: 1, borderColor: preview.ok ? "#e2e8f0" : "#fde68a", borderRadius: 8, padding: 8 }}>
              <Text style={{ fontSize: 12, color: preview.ok ? "#0f172a" : "#92400e" }}>{preview.ok ? "Result: " + preview.text : preview.text || "Enter the values above"}</Text>
              {preview.ok ? <Text style={{ fontSize: 10, color: "#64748b" }}>{preview.method}</Text> : null}
            </View>
          ) : null}

          <ItemChips label="Checklist item (optional)" items={items} value={itemId} onChange={setItemId} />
          <Pressable onPress={save} disabled={!canSave} style={{ backgroundColor: canSave ? "#0ea5e9" : "#94a3b8", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{busy ? "Saving…" : "Save measurement"}</Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 6 }}>
        {loading ? <ActivityIndicator /> : null}
        {!loading && saved.length === 0 ? <Text style={{ fontSize: 12, color: "#64748b" }}>No measurements recorded yet.</Text> : null}
        {saved.map((m) => (
          <View key={m.id} style={{ borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 6, flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>{m.name}: {fmt(m.value)} {m.unit}</Text>
              <Text style={{ fontSize: 10, color: "#64748b" }}>{m.method ?? m.formula}</Text>
              {m.formula !== "manual" ? <Text style={{ fontSize: 10, color: "#94a3b8" }}>{Object.entries(m.inputs ?? {}).map(([k, v]) => k + ": " + v.value + (v.unit === "ratio" ? "" : " " + v.unit)).join(" · ")}</Text> : null}
            </View>
            {canWrite ? <Pressable onPress={() => void remove(m.id)}><Text style={{ fontSize: 11, color: "#dc2626" }}>Delete</Text></Pressable> : null}
          </View>
        ))}
      </View>
    </View>
  );
}
