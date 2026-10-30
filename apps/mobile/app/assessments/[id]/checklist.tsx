import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";

type Item = { id: string; title: string; required: boolean };
type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string };

const STATUSES = [
  { v: "not_checked", label: "Not Checked" },
  { v: "pass", label: "Pass" },
  { v: "fail", label: "Issue / Fail" },
  { v: "needs_attention", label: "Needs Attention" },
  { v: "not_applicable", label: "N/A" },
];

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
        const data = (await res.json().catch(() => ({}))) as { pack?: "solar" | "cctv"; checklist?: Item[]; responses?: Resp[] } | undefined;
        const list = data?.checklist?.length
          ? data.checklist
          : (() => { const t = PACK_TEMPLATES[data?.pack ?? "solar"]; return t.checklist.map((title, i) => ({ id: `${String(id)}_item_${i}`, title, required: i < 5 })); })();
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

  async function saveOne() {
    if (!cur || !curResp) return;
    setSaving(true);
    try {
      try {
        apiBase();
      } catch {
        Alert.alert("Kept on this screen only", "Set EXPO_PUBLIC_APP_URL to persist responses server-side.");
        return;
      }
      const res = await apiFetch("/api/checklist/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: String(id), responses: [curResp] }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      Alert.alert("Saved", "Not Checked ≠ Pass — evidence stays linked.");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={{ flex: 1, padding: 16, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading checklist…</Text></View>;
  if (!cur) return <View style={{ flex: 1, padding: 16 }}><Text>No items.</Text></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>M12 · {idx + 1} / {items.length}</Text>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 10 }}>
        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{cur.title} {cur.required ? <Text style={{ fontSize: 10, backgroundColor: "#fef2f2", color: "#dc2626" }}> required</Text> : null}</Text>
        <Text style={{ fontSize: 11, color: "#64748b" }}>Not Applicable needs reason if required. Not Checked ≠ Pass. Evidence stays linked when status changes.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {STATUSES.map((s) => {
            const active = curResp?.status === s.v;
            return (
              <Pressable key={s.v} onPress={() => setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], status: s.v } }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? "#0f172a" : "#fff", borderWidth: 1, borderColor: active ? "#0f172a" : "#e2e8f0" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: active ? "#fff" : "#475569" }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput value={curResp?.notes ?? ""} onChangeText={(v) => setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], notes: v } }))} placeholder="Observation / notes" multiline style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff", minHeight: 60 }} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput keyboardType="numeric" value={curResp?.measuredValue !== undefined ? String(curResp.measuredValue) : ""} onChangeText={(v) => setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], measuredValue: v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined } }))} placeholder="Value" style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
          <TextInput value={curResp?.measuredUnit ?? ""} onChangeText={(v) => setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], measuredUnit: v } }))} placeholder="Unit (m, kW)" style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <Pressable onPress={saveOne} disabled={saving} style={{ backgroundColor: saving ? "#94a3b8" : "#0ea5e9", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Saving…" : "Save"}</Text></Pressable>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} style={{ flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, alignItems: "center", opacity: idx === 0 ? 0.5 : 1 }}><Text>← Previous</Text></Pressable>
          <Pressable onPress={async () => { await saveOne(); setIdx((i) => Math.min(items.length - 1, i + 1)); }} disabled={idx >= items.length - 1} style={{ flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, alignItems: "center", opacity: idx >= items.length - 1 ? 0.5 : 1 }}><Text>Next →</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable onPress={() => router.push(`/assessments/${String(id)}` as never)} style={{ paddingVertical: 8 }}><Text style={{ fontSize: 12, color: "#0ea5e9" }}>Overview</Text></Pressable>
          <Pressable onPress={() => router.replace(`/assessments/${String(id)}/checklist-builder` as never)} style={{ paddingVertical: 8 }}><Text style={{ fontSize: 12, color: "#64748b" }}>Builder</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
