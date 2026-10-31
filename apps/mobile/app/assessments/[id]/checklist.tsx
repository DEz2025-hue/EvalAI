import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { PACK_TEMPLATES, type PackId } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";
import { CHECK_STATUSES, colors, space } from "../../../lib/theme";
import { Badge, Button, Card, Chip, EmptyState, Field, Loading, ProgressBar, Screen, Text } from "../../../components/ui";

type Item = { id: string; title: string; required: boolean };
type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string };

export default function MobileChecklistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Record<string, Resp>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        apiBase();
        const res = await apiFetch(`/api/assessments/${String(id)}`);
        const data = (await res.json().catch(() => ({}))) as { pack?: PackId; checklist?: Item[]; responses?: Resp[] } | undefined;
        const list = data?.checklist?.length
          ? data.checklist
          : (() => { const t = (data?.pack && PACK_TEMPLATES[data.pack]) || PACK_TEMPLATES.solar; return t.checklist.map((title, i) => ({ id: `${String(id)}_item_${i}`, title, required: i < 5 })); })();
        setItems(list);
        const map: Record<string, Resp> = {};
        for (const it of list) map[it.id] = data?.responses?.find((r) => r.itemId === it.id) ?? { itemId: it.id, status: "not_checked" };
        setResponses(map);
      } catch {
        const t = PACK_TEMPLATES.solar;
        const list = t.checklist.map((title, i) => ({ id: `${String(id)}_item_${i}`, title, required: i < 5 }));
        setItems(list);
        const map: Record<string, Resp> = {};
        for (const it of list) map[it.id] = { itemId: it.id, status: "not_checked" };
        setResponses(map);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const cur = items[idx];
  const curResp = cur ? responses[cur.id] ?? { itemId: cur.id, status: "not_checked" } : null;
  const checked = Object.values(responses).filter((r) => r.status !== "not_checked").length;

  /** Returns true when the response was saved to the server. */
  async function saveOne(quiet = false): Promise<boolean> {
    if (!cur || !curResp) return false;
    setSaving(true);
    try {
      try {
        apiBase();
      } catch {
        Alert.alert("Not saved", "You're offline from the server — this stays on this screen until you reconnect.");
        return false;
      }
      const res = await apiFetch("/api/checklist/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: String(id), responses: [curResp] }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      if (!quiet) Alert.alert("Saved", "Your answer for this item is saved.");
      return true;
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const update = (patch: Partial<Resp>) => cur && setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], ...patch } }));

  if (loading) return <Screen><Stack.Screen options={{ title: "Checklist" }} /><Loading label="Loading checklist…" /></Screen>;
  if (!cur) return <Screen><Stack.Screen options={{ title: "Checklist" }} /><EmptyState icon="list-outline" title="No checklist items" action={<Button title="Build checklist" variant="accent" size="sm" onPress={() => router.replace(`/assessments/${String(id)}/checklist-builder` as never)} />} /></Screen>;

  const last = idx >= items.length - 1;

  return (
    <>
      <Stack.Screen options={{ title: `Item ${idx + 1} of ${items.length}` }} />
      <Screen>
        <View style={{ gap: space.xs }}>
          <ProgressBar value={checked} total={items.length} />
          <Text variant="caption">{checked} of {items.length} checked</Text>
        </View>

        <Card style={{ gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            {cur.required ? <Badge label="Required" tone="danger" /> : null}
            <Text variant="title">{cur.title}</Text>
          </View>

          <View style={{ gap: space.sm }}>
            <Text variant="label" color={colors.text}>Result</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {CHECK_STATUSES.map((s) => (
                <Chip key={s.value} label={s.label} icon={s.icon} tone={s.tone} active={curResp?.status === s.value} onPress={() => update({ status: s.value })} />
              ))}
            </View>
            {curResp?.status === "not_applicable" && cur.required ? <Text variant="caption" color={colors.warning}>Add a note explaining why this doesn't apply.</Text> : null}
          </View>

          <Field label="Notes" value={curResp?.notes ?? ""} onChangeText={(v) => update({ notes: v })} placeholder="What did you see?" multiline />

          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 2 }}>
              <Field label="Measurement" keyboardType="numeric" value={curResp?.measuredValue !== undefined ? String(curResp.measuredValue) : ""} onChangeText={(v) => update({ measuredValue: v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined })} placeholder="Value" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Unit" value={curResp?.measuredUnit ?? ""} onChangeText={(v) => update({ measuredUnit: v })} placeholder="m, kW" />
            </View>
          </View>

          <Button title={saving ? "Saving…" : "Save"} icon="save-outline" variant="secondary" onPress={() => saveOne()} loading={saving} />
        </Card>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Previous" icon="chevron-back" variant="secondary" onPress={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} style={{ flex: 1 }} />
          {last ? (
            <Button title="Finish" icon="checkmark" variant="accent" onPress={async () => { if (await saveOne(true)) router.replace(`/assessments/${String(id)}/completeness` as never); }} style={{ flex: 1 }} />
          ) : (
            <Button title="Save & next" icon="chevron-forward" variant="accent" onPress={async () => { await saveOne(true); setIdx((i) => Math.min(items.length - 1, i + 1)); }} style={{ flex: 1 }} />
          )}
        </View>

        <Button title="Edit checklist items" icon="create-outline" variant="ghost" size="sm" onPress={() => router.replace(`/assessments/${String(id)}/checklist-builder` as never)} />
        <Text variant="caption" color={colors.textSubtle} style={{ textAlign: "center" }}>Items you haven't checked never count as passed.</Text>
      </Screen>
    </>
  );
}
