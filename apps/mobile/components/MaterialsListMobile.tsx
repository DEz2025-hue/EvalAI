import { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { displayQuantity } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../lib/api";
import { colors, space } from "../lib/theme";
import { MaterialsSuggestMobile, type SuggestedItem } from "./MaterialsSuggestMobile";
import { Badge, Banner, Button, Card, EmptyState, SectionHeader, Text } from "./ui";

type Item = { id: string; description: string; quantity: number; unit: string; rationale: string; source: "measurement" | "finding" | "rule" | "user_input" | "ai_suggested"; provisional?: boolean; assumptions?: string[] };

export function MaterialsListMobile({ assessmentId, initial = [], version = 0, onVersion }: { assessmentId: string; initial?: Item[]; version?: number; onVersion?: (version: number) => void }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [saving, setSaving] = useState(false);
  const [resumeNote, setResumeNote] = useState<string | null>(null);

  async function loadPersisted() {
    try {
      apiBase();
    } catch {
      return;
    }
    try {
      const res = await apiFetch(`/api/materials?assessmentId=${assessmentId}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const d = data as { items?: Item[]; count?: number; version?: number };
      if (typeof d.version === "number") onVersion?.(d.version);
      if (d.items?.length) {
        setItems(d.items);
        setResumeNote(`Loaded ${d.count ?? d.items.length} saved item${(d.count ?? d.items.length) === 1 ? "" : "s"}.`);
      }
    } catch {}
  }

  useEffect(() => {
    loadPersisted();
  }, []);

  function addSuggested(added: SuggestedItem[]) {
    if (added.length === 0) return;
    setItems((prev) => [...prev, ...added]);
    setResumeNote(`${added.length} AI suggestion${added.length === 1 ? "" : "s"} added. Review them, then save.`);
  }

  function add() {
    // Simplified prompt flow for RN — use Alert.prompt if available, else placeholder
    Alert.alert("Add item", "Add a placeholder item now and fill in the details on the web app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add placeholder",
        onPress: () => {
          const it: Item = {
            id: `tmp-${Date.now()}`,
            description: "New item — add description",
            quantity: 1,
            unit: "pc",
            rationale: "Added by you — link it to a finding or measurement",
            source: "user_input",
            provisional: true,
            assumptions: ["Quantity not confirmed yet"],
          };
          setItems((prev) => [...prev, it]);
        },
      },
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      try {
        apiBase();
      } catch {
        Alert.alert("Not saved", "Can't reach the server. Your items stay on this screen but will be lost if you leave.");
        return;
      }
      const res = await apiFetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, items, version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      const d = data as { version?: number; persisted?: boolean };
      if (typeof d.version === "number") onVersion?.(d.version);
      Alert.alert("Materials saved", `Saved as version ${d.version ?? version + 1}. Quotes based on earlier versions now need updating.`);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Materials" subtitle={version > 0 ? `Version ${version}` : "Not saved yet"} />
      <MaterialsSuggestMobile assessmentId={assessmentId} onAdd={addSuggested} />
      {resumeNote ? <Banner tone="success" message={resumeNote} /> : null}

      {items.length === 0 ? (
        <EmptyState icon="cube-outline" title="No materials yet" message="Add items, each with the reason it's needed." />
      ) : (
        <View>
          {items.map((it, i) => (
            <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.divider }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={2}>{it.description}</Text>
                <Text variant="caption" numberOfLines={1}>{it.rationale}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text variant="bodyStrong">{displayQuantity(it)}</Text>
                {it.source === "ai_suggested" ? <Badge label="AI suggestion" tone="info" /> : null}
                {it.provisional ? <Badge label="Provisional" tone="warning" /> : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Add item" icon="add" variant="secondary" onPress={add} style={{ flex: 1 }} />
        <Button title={saving ? "Saving…" : "Save"} icon="save-outline" variant="accent" onPress={save} loading={saving} style={{ flex: 1 }} />
      </View>
      <Text variant="caption" color={colors.textSubtle}>Changing materials marks existing quotes as out of date.</Text>
    </Card>
  );
}
