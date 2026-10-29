import { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { apiFetch, apiBase } from "../lib/api";

type Item = { id: string; description: string; quantity: number; unit: string; rationale: string; source: "measurement" | "finding" | "rule" | "user_input"; provisional?: boolean; assumptions?: string[] };

export function MaterialsListMobile({ assessmentId, initial = [], version = 1 }: { assessmentId: string; initial?: Item[]; version?: number }) {
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
      const d = data as { items?: Item[]; count?: number };
      if (d.items?.length) {
        setItems(d.items);
        setResumeNote(`Resumed ${d.count ?? d.items.length} persisted items — save to bump to v${version + 1}`);
      }
    } catch {}
  }

  useEffect(() => {
    loadPersisted();
  }, []);

  function add() {
    // Simplified prompt flow for RN — use Alert.prompt if available, else placeholder
    Alert.alert("Add item", "Use web Materials UI for full rationale capture, or add quick item here.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add quick (provisional)",
        onPress: () => {
          const it: Item = {
            id: `tmp-${Date.now()}`,
            description: "550W mono panel — trace to finding/measurement",
            quantity: 1,
            unit: "pc",
            rationale: "user_input demo — replace with finding # + measurement",
            source: "user_input",
            provisional: true,
            assumptions: ["Quantity provisional — missing critical input"],
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
        Alert.alert("Kept on this screen only", "Items are staged in memory and will be lost if you leave. Set EXPO_PUBLIC_APP_URL to persist them server-side.");
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
      Alert.alert(`Saved materials v${d.version ?? version + 1}${d.persisted ? " to Supabase" : " to server fallback"} — quotations for prior versions now stale`);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff", padding: 12, gap: 10 }}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Materials schedule — traceable {version ? `· v${version}` : ""}</Text>
      {resumeNote ? <Text style={{ fontSize: 11, color: "#15803d", backgroundColor: "#f0fdf4", padding: 6, borderRadius: 6 }}>{resumeNote}</Text> : null}
      <Text style={{ fontSize: 11, color: "#64748b" }}>Each item needs rationale + source. <Text style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>Provisional</Text> when inputs missing — clearly identified.</Text>

      <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", backgroundColor: "#f8fafc", paddingHorizontal: 8, paddingVertical: 6, gap: 6 }}>
          <Text style={{ flex: 2, fontSize: 11, fontWeight: "600", color: "#475569" }}>Description</Text>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: "#475569" }}>Qty</Text>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: "#475569" }}>Prov.</Text>
        </View>
        {items.length === 0 ? (
          <View style={{ padding: 16, alignItems: "center" }}><Text style={{ fontSize: 12, color: "#64748b" }}>No materials — add items or generate from findings/measurements</Text></View>
        ) : (
          items.map((it) => (
            <View key={it.id} style={{ flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9", gap: 6 }}>
              <Text style={{ flex: 2, fontSize: 12, color: "#0f172a" }} numberOfLines={2}>{it.description}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: "#0f172a" }}>{it.quantity} {it.unit}</Text>
              <Text style={{ flex: 1, fontSize: 11, color: it.provisional ? "#92400e" : "#64748b" }}>{it.provisional ? "provisional" : "—"}</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={add} style={{ borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
          <Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>Add item</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving} style={{ backgroundColor: saving ? "#94a3b8" : "#0ea5e9", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{saving ? "Saving…" : `Save v${version + 1}`}</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 10, color: "#64748b" }}>If you change materials, existing quotes may be out of date.</Text>
    </View>
  );
}
