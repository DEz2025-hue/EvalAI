import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { FORMULAS, LENGTH_UNITS, calculateMeasurement, hasPhotoInput, toMetres, type FormulaId, type LengthUnit, type MeasurementInput, type PhotoCapture } from "@eval-ai/shared";
import { apiFetch } from "../lib/api";
import { useRole } from "../lib/role";
import { colors, radius, space } from "../lib/theme";
import { ItemChips, type ChipItem } from "./ItemChips";
import { Badge, Banner, Button, Card, Chip, Field, Icon, IconButton, Loading, SectionHeader, Text } from "./ui";
import { PhotoMeasureModal, type PhotoMeasureResult } from "./PhotoMeasureModal";

type Saved = { id: string; name: string; formula: string; method?: string; inputs: Record<string, { value: number; unit: string; source?: string }>; value: number; unit: string; itemId: string | null };

const fmt = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1e4) / 1e4) : "—");
/**
 * Recorded measurements: formula, inputs (with units) and result are saved; the server computes the result.
 * Lengths are typed from a tape or meter, or estimated from a photo with a reference object (always labelled an estimate).
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
  /** Which field the photo screen is open for ("manual" for the manual value), and each field's photo capture. */
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [captures, setCaptures] = useState<Record<string, PhotoCapture | undefined>>({});
  const dropCapture = (key: string) => setCaptures((c) => (c[key] ? { ...c, [key]: undefined } : c));

  const load = useCallback(async () => {
    setError(null);
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
      const photo = captures[spec.key];
      if (photo) {
        out[spec.key].source = "photo";
        out[spec.key].photo = photo;
      }
    }
    return out;
  }, [def, values, captures]);

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
          ? { assessmentId, name: name.trim(), formula, itemId: itemId || null, value: manualValue, unit: manual.unit.trim(), ...(captures.manual ? { source: "photo" as const, photo: captures.manual } : {}) }
          : { assessmentId, name: name.trim(), formula, itemId: itemId || null, inputs };
      const res = await apiFetch("/api/measurements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save measurement");
      setName("");
      setValues({});
      setCaptures({});
      setManual({ value: "", unit: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Put a photo-estimated length into the field it was opened for, in that field's unit, and remember how it was made. */
  function applyPhoto(r: PhotoMeasureResult) {
    const key = photoFor;
    setPhotoFor(null);
    if (!key) return;
    if (key === "manual") {
      setManual({ value: String(Math.round(r.valueM * 1e4) / 1e4), unit: "m" });
    } else {
      const current = values[key]?.unit ?? def?.inputs.find((i) => i.key === key)?.defaultUnit;
      const unit: LengthUnit = current && current !== "ratio" ? current : "m";
      setValues((v) => ({ ...v, [key]: { value: String(Math.round((r.valueM / toMetres(1, unit)) * 1e4) / 1e4), unit } }));
    }
    setCaptures((c) => ({ ...c, [key]: r.capture }));
  }

  const cameraButton = (key: string, what: string) => (
    <Pressable onPress={() => setPhotoFor(key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Measure ${what} from a photo`} style={{ paddingHorizontal: space.md, alignSelf: "center" }}>
      <Icon name="camera-outline" size={22} color={colors.accent} />
    </Pressable>
  );

  async function remove(id: string) {
    setError(null);
    const res = await apiFetch("/api/measurements?assessmentId=" + assessmentId + "&id=" + id, { method: "DELETE" });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not delete");
    else await load();
  }

  return (
    <Card>
      <SectionHeader title="Measurements" subtitle="Each one keeps its formula, inputs and units. Results are calculated on the server. The camera button estimates a length from a photo and is always labelled as an estimate." />
      {error ? <Banner tone="danger" message={error} action={<Button title="Try again" icon="refresh" size="sm" variant="danger" onPress={() => { setLoading(true); void load(); }} />} /> : null}

      {loaded && !canWrite ? (
        <Text variant="caption">You have view-only access — you can see saved measurements.</Text>
      ) : (
        <View style={{ gap: space.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {Object.values(FORMULAS).map((f) => <Chip key={f.id} label={f.label.split(" (")[0]} tone="accent" active={formula === f.id} onPress={() => { setFormula(f.id); setValues({}); setCaptures({}); }} />)}
            <Chip label="Manual reading" icon="speedometer-outline" tone="accent" active={formula === "manual"} onPress={() => { setFormula("manual"); setValues({}); setCaptures({}); }} />
          </ScrollView>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. North roof area" maxLength={200} />

          {def ? (
            def.inputs.map((spec) => (
              <View key={spec.key} style={{ gap: 6 }}>
                <Field
                  label={spec.label}
                  keyboardType="decimal-pad"
                  value={values[spec.key]?.value ?? (spec.kind === "ratio" ? String(spec.defaultValue ?? "") : "")}
                  onChangeText={(t) => {
                    dropCapture(spec.key);
                    setValues((v) => ({ ...v, [spec.key]: { value: t, unit: v[spec.key]?.unit ?? spec.defaultUnit } }));
                  }}
                  right={spec.kind === "length" ? cameraButton(spec.key, spec.label.toLowerCase()) : undefined}
                />
                {captures[spec.key] ? <Badge label="Photo estimate · not verified" tone="warning" /> : null}
                {spec.kind === "length" ? (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {LENGTH_UNITS.map((u) => <Chip key={u} label={u} active={(values[spec.key]?.unit ?? spec.defaultUnit) === u} onPress={() => { dropCapture(spec.key); setValues((v) => ({ ...v, [spec.key]: { value: v[spec.key]?.value ?? "", unit: u } })); }} />)}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 2, gap: 6 }}>
                <Field label="Value" keyboardType="decimal-pad" value={manual.value} onChangeText={(t) => { dropCapture("manual"); setManual({ ...manual, value: t }); }} placeholder="0.0" right={cameraButton("manual", "this value")} />
                {captures.manual ? <Badge label="Photo estimate · not verified" tone="warning" /> : null}
              </View>
              <View style={{ flex: 1 }}><Field label="Unit" value={manual.unit} onChangeText={(t) => { dropCapture("manual"); setManual({ ...manual, unit: t }); }} placeholder="V, A, kW" maxLength={20} /></View>
            </View>
          )}

          {def ? (
            preview.ok ? (
              <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: space.md, gap: 2 }}>
                <Text variant="overline" color={colors.accentText}>Result</Text>
                <Text variant="title" color={colors.accentText}>{preview.text}</Text>
                <Text variant="caption">{preview.method}</Text>
              </View>
            ) : <Banner tone="warning" message={preview.text || "Enter the values above"} />
          ) : null}

          <ItemChips label="Checklist item (optional)" items={items} value={itemId} onChange={setItemId} />
          <Button title={busy ? "Saving…" : "Save measurement"} icon="save-outline" variant="accent" onPress={save} loading={busy} disabled={!canSave} />
        </View>
      )}

      <View style={{ gap: space.sm }}>
        {loading ? <Loading /> : null}
        {!loading && saved.length === 0 ? <Text variant="caption">No measurements recorded yet.</Text> : null}
        {saved.map((m) => (
          <View key={m.id} style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{m.name}: {fmt(m.value)} {m.unit}</Text>
              <Text variant="caption">{m.method ?? m.formula}</Text>
              {hasPhotoInput(m.inputs) || (m.method ?? "").startsWith("photo estimate") ? <Badge label="Photo estimate · not verified" tone="warning" /> : null}
              {m.formula !== "manual" ? <Text style={{ fontSize: 11, color: colors.textSubtle }}>{Object.entries(m.inputs ?? {}).map(([k, v]) => k + ": " + v.value + (v.unit === "ratio" ? "" : " " + v.unit)).join(" · ")}</Text> : null}
            </View>
            {canWrite ? <IconButton icon="trash-outline" label={`Delete ${m.name}`} tone="danger" onPress={() => void remove(m.id)} /> : null}
          </View>
        ))}
      </View>

      <PhotoMeasureModal visible={photoFor !== null} assessmentId={assessmentId} onClose={() => setPhotoFor(null)} onUse={applyPhoto} />
    </Card>
  );
}
