import { useEffect, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";
import { colors, radius, space, type Tone } from "../../../lib/theme";
import { useKeyboardReveal } from "../../../components/keyboard";
import { Badge, Banner, Button, Card, Chip, IconButton, Loading, Screen, Text } from "../../../components/ui";

type Source = "established" | "user" | "ai_suggested";
type Item = { id: string; title: string; instructions?: string; required: boolean; category?: string; source: Source; rationale?: string };

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
  const [notice, setNotice] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

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
        body: JSON.stringify({ assessmentId: String(id), items: items.map((it) => ({ id: it.id, title: it.title, instructions: it.instructions, required: it.required, category: it.category, source: it.source, rationale: it.rationale })) }),
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
  function updateLookFor(idx: number, instructions: string) { setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, instructions } : it))); }
  function toggleRequired(idx: number) { setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, required: !it.required } : it))); }
  function removeAt(idx: number) {
    const it = items[idx];
    // Saving removes the item's answer for good; photos stay with the job but are no longer linked to it.
    Alert.alert(
      it.required ? "Remove a required item?" : "Remove this item?",
      `"${it.title}" and any answer recorded for it will be removed when you save. Photos stay with the job.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => setItems((prev) => prev.filter((_, i) => i !== idx)) }],
    );
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    setNotice(null);
    try {
      apiBase();
      const res = await apiFetch("/api/ai/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: String(id), currentItems: items.map((i) => ({ title: i.title, instructions: i.instructions, category: i.category })) }) });
      const data = (await res.json().catch(() => ({}))) as { skipped?: Array<{ title: string; duplicateOf: string }>; items?: Array<{ title: string; rationale?: string; category?: string; instructions?: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "AI suggestions are unavailable — continue with the checklist you have");
      // The server already leaves out repeats by meaning; this catches an exact title typed since.
      const skippedCount = (data.skipped ?? []).length;
      const existing = new Set(items.map((i) => i.title.trim().toLowerCase()));
      const fresh = (data.items ?? []).filter((s) => s.title && !existing.has(s.title.trim().toLowerCase())).slice(0, 10);
      if (fresh.length === 0) {
        setNotice(skippedCount > 0 ? `No new suggestions: all ${skippedCount} the AI proposed repeat items already on the checklist.` : "No new suggestions — the checklist already covers what the AI proposed.");
        return;
      }
      // Same as the web builder: suggestions are optional, labelled, and only kept once you save.
      setItems((prev) => [...prev, ...fresh.map((s, i) => ({ id: `ai_${Date.now()}_${i}`, title: s.title, required: false, category: s.category ?? "AI suggested", instructions: s.instructions, source: "ai_suggested" as const, rationale: s.rationale }))]);
      setNotice(`${fresh.length} AI suggestion${fresh.length === 1 ? "" : "s"} added at the end — review each one, then remove or keep it.${skippedCount > 0 ? " " + `${skippedCount} suggestion${skippedCount === 1 ? "" : "s"} left out because the checklist already covers ${skippedCount === 1 ? "it" : "them"}.` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
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
        <Text variant="caption">{items.length} items · {items.filter((i) => i.required).length} required · tap Required/Optional to switch, then save.</Text>
        {error ? <Banner tone="warning" message={error} /> : null}
        {notice ? <Banner tone="info" message={notice} /> : null}

        {items.map((it, idx) => (
          <Card key={it.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <Chip label={it.required ? "Required" : "Optional"} tone={it.required ? "danger" : "neutral"} active={it.required} onPress={() => toggleRequired(idx)} />
              <Badge label={SOURCE_BADGE[it.source].label} tone={SOURCE_BADGE[it.source].tone} />
              {it.category ? <Badge label={it.category} /> : null}
            </View>
            <TextInput onFocus={reveal}
              value={it.title}
              onChangeText={(v) => updateTitle(idx, v)}
              multiline
              accessibilityLabel="Item title"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.surface }}
            />
            <Text variant="caption">Look for</Text>
            <TextInput onFocus={reveal}
              value={it.instructions ?? ""}
              onChangeText={(v) => updateLookFor(idx, v)}
              multiline
              maxLength={2000}
              placeholder="What to observe or record (shown while checking)"
              placeholderTextColor={colors.textSubtle}
              accessibilityLabel="Look for"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 8, fontSize: 13, color: colors.text, backgroundColor: colors.surface }}
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

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Add item" icon="add" variant="secondary" onPress={addItem} style={{ flex: 1 }} />
          <Button title={suggesting ? "Asking AI…" : "Suggest with AI"} icon="sparkles-outline" variant="secondary" onPress={() => void suggest()} loading={suggesting} style={{ flex: 1 }} />
        </View>
        <Button title={saving ? "Saving…" : "Save & start checking"} icon="checkmark" variant="accent" size="lg" onPress={confirm} loading={saving} />
        <Button title="Back to questions" variant="ghost" size="sm" onPress={() => router.push(`/assessments/${String(id)}/clarify` as never)} />
      </Screen>
    </>
  );
}
