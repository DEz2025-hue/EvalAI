import { useCallback, useEffect, useState } from "react";
import { Alert, Image, View } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { apiFetch, apiBase } from "../../../lib/api";
import { colors, radius } from "../../../lib/theme";
import { Banner, Button, Card, Chip, EmptyState, IconButton, ListRow, Loading, Screen, SectionHeader } from "../../../components/ui";

type Ev = { id: string; storage_key: string; mime_type?: string; item_id?: string; uploaded_at: string };

export default function MobileEvidenceGallery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<Ev[]>([]);
  const [filter, setFilter] = useState<"all" | "image" | "audio">("all");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Ev | null>(null);
  const [signed, setSigned] = useState<string | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);

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
    Alert.alert("Delete this file?", `"${ev.storage_key.split("/").pop()}" will be removed from the job.`, [
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
      const s = createAudioPlayer({ uri });
      setSound(s);
      s.play();
    } catch (e) { Alert.alert("Playback failed", e instanceof Error ? e.message : String(e)); }
  }

  useEffect(() => () => { sound?.remove(); }, [sound]);

  const filtered = items.filter((it) => {
    if (filter === "all") return true;
    if (filter === "image") return (it.mime_type ?? "").startsWith("image/");
    if (filter === "audio") return (it.mime_type ?? "").startsWith("audio/");
    return true;
  });

  const isImage = (ev: Ev) => (ev.mime_type ?? "").startsWith("image/");

  return (
    <Screen onRefresh={load} refreshing={false}>
      <Stack.Screen options={{ title: "Evidence" }} />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Photos" icon="image-outline" active={filter === "image"} onPress={() => setFilter("image")} />
        <Chip label="Audio" icon="mic-outline" active={filter === "audio"} onPress={() => setFilter("audio")} />
      </View>

      {preview ? (
        <Card>
          <SectionHeader title={preview.storage_key.split("/").pop() ?? "File"} subtitle={preview.item_id ? "Linked to a checklist item" : "Linked to the job"} action={<IconButton icon="close" label="Close preview" onPress={() => setPreview(null)} />} />
          {signed ? (
            isImage(preview)
              ? <Image source={{ uri: signed }} style={{ width: "100%", height: 240, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} resizeMode="contain" />
              : <Button title="Play audio" icon="play" variant="accent" onPress={() => playAudio(signed)} />
          ) : <Banner tone="neutral" message="This file couldn't be opened. The link may have expired — close and tap it again." />}
          <Button title="Delete" icon="trash-outline" variant="danger" size="sm" onPress={() => remove(preview)} style={{ alignSelf: "flex-start" }} />
        </Card>
      ) : null}

      {loading ? <Loading label="Loading files…" rows={3} /> : null}
      {filtered.length === 0 && !loading ? (
        <EmptyState icon="images-outline" title="No photos or audio yet" message="Capture them from the job screen — each one is linked to the item it belongs to." />
      ) : (
        <Card padded={false}>
          {filtered.map((ev, i, arr) => (
            <ListRow
              key={ev.id}
              icon={isImage(ev) ? "image-outline" : "mic-outline"}
              title={ev.storage_key.split("/").pop() ?? "File"}
              subtitle={`${ev.item_id ? "Checklist item" : "Job"} · ${new Date(ev.uploaded_at).toLocaleString()}`}
              onPress={() => openPreview(ev)}
              last={i === arr.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
