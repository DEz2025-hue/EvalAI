import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";

type Source = "established" | "user" | "ai_suggested";
type Item = { id: string; title: string; required: boolean; category?: string; source: Source; rationale?: string };

const SOURCE_STYLE: Record<Source, { label: string; bg: string; fg: string }> = {
  established: { label: "Pack requirement", bg: "#f8fafc", fg: "#475569" },
  user: { label: "Added by you", bg: "#f0f9ff", fg: "#075985" },
  ai_suggested: { label: "AI suggestion — review", bg: "#fef3c7", fg: "#92400e" },
};

export default function MobileChecklistBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        apiBase();
        const res = await apiFetch("/api/assessments/" + String(id));
        const data = (await res.json().catch(() => ({}))) as { checklist?: Array<Omit<Item, "source"> & { source?: Source }>; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load the checklist");
        setItems((data.checklist ?? []).map((it) => ({ ...it, source: it.source ?? "established" })));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      try {
        apiBase();
      } catch {
        setError("Set EXPO_PUBLIC_APP_URL to persist builder edits — navigating without saving.");
        router.replace(`/assessments/${String(id)}/checklist` as never);
        return;
      }
      // Persist edits (add/remove/reorder/titles) — otherwise they are discarded.
      const res = await apiFetch("/api/checklist/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: String(id), items: items.map((it) => ({ id: it.id, title: it.title, required: it.required, category: it.category, source: it.source, rationale: it.rationale })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not save checklist");
      router.replace(`/assessments/${String(id)}/checklist` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function updateTitle(idx: number, title: string) { setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, title, source: it.source === "established" ? "user" as const : it.source } : it))); }
  function removeAt(idx: number) {
    const it = items[idx];
    if (it.required) Alert.alert("Required item", `Removing "${it.title}" — confirm?`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => setItems((prev) => prev.filter((_, i) => i !== idx)) }]);
    else setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    setItems((prev) => { const a = [...prev]; const [v] = a.splice(idx, 1); a.splice(j, 0, v); return a; });
  }
  function addItem() {
    const it: Item = { id: "new_" + Date.now(), title: "New item", required: false, source: "user" };
    setItems((prev) => [...prev, it]);
  }

  if (loading) return <View style={{ flex: 1, padding: 16, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading builder…</Text></View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>M10 · Checklist Builder</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>{String(id).slice(0, 8)} · {items.length} items · grouped — edit, add/remove/reorder, required warns</Text>
      {error ? <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#92400e" }}>{error}</Text></View> : null}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={addItem} style={{ borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>Add item</Text></Pressable>
        <Pressable onPress={confirm} disabled={saving} style={{ backgroundColor: "#0ea5e9", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{saving ? "Saving…" : "Confirm → Checklist"}</Text></Pressable>
        <Pressable onPress={() => router.push(`/assessments/${String(id)}/clarify` as never)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}><Text style={{ fontSize: 12, color: "#64748b" }}>Back</Text></Pressable>
      </View>
      {items.map((it, idx) => (
        <View key={it.id} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 10, fontWeight: "700", backgroundColor: it.required ? "#fef2f2" : "#f1f5f9", color: it.required ? "#dc2626" : "#475569", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>{it.required ? "required" : "optional"}</Text>
            <Text style={{ fontSize: 10, backgroundColor: SOURCE_STYLE[it.source].bg, color: SOURCE_STYLE[it.source].fg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>{SOURCE_STYLE[it.source].label}</Text>
            {it.category ? <Text style={{ fontSize: 10, backgroundColor: "#f1f5f9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>{it.category}</Text> : null}
          </View>
          <TextInput value={it.title} onChangeText={(v) => updateTitle(idx, v)} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
          {it.rationale ? <Text style={{ fontSize: 11, color: "#64748b" }}>Rationale: {it.rationale}</Text> : null}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable onPress={() => move(idx, -1)} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}><Text>↑</Text></Pressable>
            <Pressable onPress={() => move(idx, 1)} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}><Text>↓</Text></Pressable>
            <Pressable onPress={() => removeAt(idx)} style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}><Text style={{ color: "#dc2626", fontWeight: "600" }}>Remove</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
