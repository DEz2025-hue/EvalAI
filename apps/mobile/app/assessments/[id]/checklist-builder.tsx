import { useEffect, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";
import { colors, radius, space, type Tone } from "../../../lib/theme";
import { useKeyboardReveal } from "../../../components/keyboard";
import { Badge, Banner, Button, Card, IconButton, Loading, Screen, Text } from "../../../components/ui";

type Source = "established" | "user" | "ai_suggested";
type Item = { id: string; title: string; required: boolean; category?: string; source: Source; rationale?: string };

const SOURCE_BADGE: Record<Source, { label: string; tone: Tone }> = {
  established: { label: "Template", tone: "neutral" },
  user: { label: "Added by you", tone: "accent" },
  ai_suggested: { label: "AI suggestion — review", tone: "warning" },
};

export default function MobileChecklistBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const reveal = useKeyboardReveal();
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
        setError("Can't reach the server — your edits weren't saved.");
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
    if (it.required) Alert.alert("Remove a required item?", `"${it.title}" is required by the template.`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => setItems((prev) => prev.filter((_, i) => i !== idx)) }]);
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

  if (loading) return <Screen><Stack.Screen options={{ title: "Edit checklist" }} /><Loading label="Loading checklist…" /></Screen>;
  return (
    <>
      <Stack.Screen options={{ title: "Edit checklist" }} />
      <Screen>
        <Text variant="caption">{items.length} items · rename, reorder, add or remove before you start checking.</Text>
        {error ? <Banner tone="warning" message={error} /> : null}

        {items.map((it, idx) => (
          <Card key={it.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Badge label={it.required ? "Required" : "Optional"} tone={it.required ? "danger" : "neutral"} />
              <Badge label={SOURCE_BADGE[it.source].label} tone={SOURCE_BADGE[it.source].tone} />
              {it.category ? <Badge label={it.category} /> : null}
            </View>
            <TextInput onFocus={reveal}
              value={it.title}
              onChangeText={(v) => updateTitle(idx, v)}
              multiline
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.surface }}
            />
            {it.rationale ? <Text variant="caption">Why: {it.rationale}</Text> : null}
            <View style={{ flexDirection: "row", gap: 6 }}>
              <IconButton icon="arrow-up" label="Move up" onPress={() => move(idx, -1)} disabled={idx === 0} />
              <IconButton icon="arrow-down" label="Move down" onPress={() => move(idx, 1)} disabled={idx === items.length - 1} />
              <View style={{ flex: 1 }} />
              <IconButton icon="trash-outline" label="Remove item" tone="danger" onPress={() => removeAt(idx)} />
            </View>
          </Card>
        ))}

        <Button title="Add item" icon="add" variant="secondary" onPress={addItem} />
        <Button title={saving ? "Saving…" : "Save & start checking"} icon="checkmark" variant="accent" size="lg" onPress={confirm} loading={saving} />
        <Button title="Back to questions" variant="ghost" size="sm" onPress={() => router.push(`/assessments/${String(id)}/clarify` as never)} />
      </Screen>
    </>
  );
}
