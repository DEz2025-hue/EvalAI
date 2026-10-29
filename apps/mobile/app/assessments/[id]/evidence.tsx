import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Image } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { Audio } from "expo-av";
import { apiFetch, apiBase } from "../../../lib/api";

type Ev = { id: string; storage_key: string; mime_type?: string; item_id?: string; uploaded_at: string };

export default function MobileEvidenceGallery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<Ev[]>([]);
  const [filter, setFilter] = useState<"all" | "image" | "audio">("all");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Ev | null>(null);
  const [signed, setSigned] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      try {
        apiBase();
      } catch {
        setItems([]);
        return;
      }
      const res = await apiFetch(`/api/evidence/upload?assessmentId=${String(id)}`).catch(() => null as unknown as Response);
      if (res?.ok) {
        const data = await res.json().catch(() => ({}));
        setItems(((data as { items?: Ev[] }).items ?? []) as Ev[]);
      } else setItems([]);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function openPreview(ev: Ev) {
    setPreview(ev);
    setSigned(null);
    try {
      apiBase();
      const res = await apiFetch("/api/evidence/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signedUrl", assessmentId: String(id), storageKey: ev.storage_key }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSigned((data as { signedUrl?: string }).signedUrl ?? null);
    } catch {}
  }

  async function remove(ev: Ev) {
    Alert.alert("Delete evidence?", `"${ev.storage_key.split("/").pop()}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/evidence/upload?assessmentId=${String(id)}&evidenceId=${ev.id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data as { error?: string }).error ?? "Delete failed");
            setItems((prev) => prev.filter((it) => it.id !== ev.id));
            setPreview(null);
          } catch (e) {
            Alert.alert("Delete failed", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  async function playAudio(uri: string) {
    try {
      const { sound: s } = await Audio.Sound.createAsync({ uri });
      setSound(s);
      await s.playAsync();
    } catch (e) { Alert.alert("Playback failed", e instanceof Error ? e.message : String(e)); }
  }

  useEffect(() => () => { sound?.unloadAsync().catch(() => {}); }, [sound]);

  const filtered = items.filter((it) => {
    if (filter === "all") return true;
    if (filter === "image") return (it.mime_type ?? "").startsWith("image/");
    if (filter === "audio") return (it.mime_type ?? "").startsWith("audio/");
    return true;
  });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>W09 · Evidence Gallery — {String(id).slice(0, 8)}</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>Private storage, signed links only. Filter by type, preview, keyboard accessible labels.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["all", "image", "audio"] as const).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: filter === f ? "#0f172a" : "#fff", borderWidth: 1, borderColor: filter === f ? "#0f172a" : "#e2e8f0" }}>
            <Text style={{ fontSize: 12, color: filter === f ? "#fff" : "#475569", fontWeight: "600" }}>{f}</Text>
          </Pressable>
        ))}
        <Pressable onPress={load} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}><Text style={{ fontSize: 12, color: "#0f172a" }}>Refresh</Text></Pressable>
      </View>
      {loading ? <View style={{ padding: 16, alignItems: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading…</Text></View> : null}
      {filtered.length === 0 && !loading ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 20, alignItems: "center" }}><Text style={{ fontSize: 12, color: "#64748b" }}>No evidence — add via checklist → Photo/Voice. Upload is server-confirmed.</Text></View>
      ) : (
        filtered.map((ev) => (
          <View key={ev.id} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 4 }}>
            <Pressable onPress={() => openPreview(ev)}>
              <Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>{ev.storage_key.split("/").pop()}</Text>
              <Text style={{ fontSize: 11, color: "#64748b" }}>{ev.mime_type ?? "—"} · {ev.item_id ? `item ${ev.item_id.slice(0, 8)}` : "assessment"} · {new Date(ev.uploaded_at).toLocaleString()}</Text>
              <Text style={{ fontSize: 11, color: "#0ea5e9", fontWeight: "600" }}>Preview →</Text>
            </Pressable>
            <Pressable onPress={() => remove(ev)}><Text style={{ fontSize: 11, color: "#dc2626", fontWeight: "600" }}>Delete</Text></Pressable>
          </View>
        ))
      )}
      {preview ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{preview.storage_key}</Text>
          <Text style={{ fontSize: 11, color: "#64748b" }}>{preview.mime_type} · linked {preview.item_id?.slice(0, 8) ?? "—"} — provenance</Text>
          {signed ? (
            preview.mime_type?.startsWith("image/") ? <Image source={{ uri: signed }} style={{ width: "100%", height: 200, borderRadius: 8, backgroundColor: "#f1f5f9" }} resizeMode="contain" /> : <Pressable onPress={() => playAudio(signed)} style={{ backgroundColor: "#0ea5e9", paddingVertical: 10, borderRadius: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Play audio</Text></Pressable>
          ) : <Text style={{ fontSize: 12, color: "#64748b", backgroundColor: "#f8fafc", padding: 10, borderRadius: 8 }}>Signed URL expired/unauthorized — RLS. Private files never public.</Text>}
          <Pressable onPress={() => setPreview(null)} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 8, borderRadius: 8, alignItems: "center" }}><Text style={{ fontSize: 12, color: "#0f172a" }}>Close</Text></Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
