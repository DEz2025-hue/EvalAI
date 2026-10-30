import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { ChecklistStatus } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../lib/api";

type Item = { id: string; title: string; instructions?: string; required: boolean; category?: string };
type Response = { itemId: string; status: (typeof ChecklistStatus._type); notes?: string; measuredValue?: number; measuredUnit?: string };

const STATUSES = [
  { v: "not_checked", label: "Not Checked" },
  { v: "pass", label: "Pass" },
  { v: "fail", label: "Issue / Fail" },
  { v: "needs_attention", label: "Needs Attention" },
  { v: "not_applicable", label: "N/A" },
] as const;

export function ChecklistEditorMobile({ items: initial, assessmentId }: { items: Item[]; assessmentId: string }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [responses, setResponses] = useState<Record<string, Response>>(
    Object.fromEntries(initial.map((it) => [it.id, { itemId: it.id, status: "not_checked" as const }]))
  );
  const [saving, setSaving] = useState(false);

  function updateStatus(id: string, status: Response["status"]) {
    setResponses((r) => ({ ...r, [id]: { ...r[id], status } }));
  }

  // Resume: load previously saved responses when an API base is configured
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        apiBase();
        const res = await apiFetch(`/api/checklist/responses?assessmentId=${assessmentId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const list = ((data as { responses?: Response[] }).responses ?? []) as Response[];
        if (list.length > 0) {
          setResponses((prev) => {
            const next = { ...prev };
            for (const r of list) if (next[r.itemId]) next[r.itemId] = r;
            return next;
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  async function save() {
    setSaving(true);
    try {
      let base: string;
      try {
        base = apiBase();
      } catch {
        base = "";
      }
      if (!base) {
        Alert.alert("Kept on this screen only", "Responses are staged in memory and will be lost if you leave. Set EXPO_PUBLIC_APP_URL to persist them server-side. Not Checked ≠ Pass.");
        return;
      }
      // Step 1: persist the item list itself so new/edited items get real ids.
      const putRes = await apiFetch("/api/checklist/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, items: items.map((it) => ({ id: it.id, title: it.title, required: it.required, category: it.category })) }),
      });
      const putData = await putRes.json().catch(() => ({}));
      if (!putRes.ok) throw new Error((putData as { error?: string }).error ?? "Could not save checklist items");
      const rows = ((putData as { items?: Item[] }).items ?? []) as Item[];
      if (rows.length !== items.length) throw new Error("Item mapping mismatched — reload before editing further.");
      setItems(rows);
      const rekeyed: Record<string, Response> = {};
      items.forEach((old, i) => {
        const r = responses[old.id];
        if (r) rekeyed[rows[i].id] = { ...r, itemId: rows[i].id };
      });
      setResponses(rekeyed);
      const res = await apiFetch("/api/checklist/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, responses: Object.values(rekeyed) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      Alert.alert("Saved", `Checklist responses saved${(data as { persisted?: boolean }).persisted ? " to Supabase" : " to server fallback"} — server-side. Not Checked ≠ Pass.`);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function updateTitle(id: string, title: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
  }

  function addItem() {
    const append = (title: string) => {
      if (!title.trim()) return;
      const it: Item = { id: `tmp-${Date.now()}`, title: title.trim(), required: false };
      setItems((prev) => [...prev, it]);
      setResponses((prev) => ({ ...prev, [it.id]: { itemId: it.id, status: "not_checked" as const } }));
    };
    if (Alert.prompt) {
      Alert.prompt("New item title", undefined, append);
    } else {
      // Android has no Alert.prompt — add an empty row with an editable title field below.
      append("New item");
    }
  }

  return (
    <View style={{ gap: 10 }}>
      {items.map((it) => {
        const r = responses[it.id] ?? { itemId: it.id, status: "not_checked" as const };
        return (
          <View key={it.id} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                {it.id.startsWith("tmp-") ? (
                  <TextInput value={it.title} onChangeText={(v) => updateTitle(it.id, v)} placeholder="Item title" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, fontWeight: "700", color: "#0f172a", backgroundColor: "#fff" }} />
                ) : (
                  <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{it.title}</Text>
                )}
                {it.required ? <Text style={{ fontSize: 10, color: "#dc2626", backgroundColor: "#fef2f2", paddingHorizontal: 4 }}>required</Text> : null}
                {it.instructions ? <Text style={{ fontSize: 11, color: "#64748b" }}>{it.instructions}</Text> : null}
                {it.category ? <Text style={{ fontSize: 10, color: "#475569", backgroundColor: "#f1f5f9", alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>{it.category}</Text> : null}
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {STATUSES.map((s) => {
                const active = r.status === s.v;
                return (
                  <Pressable key={s.v} onPress={() => updateStatus(it.id, s.v as Response["status"])} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? "#0f172a" : "#fff", borderWidth: 1, borderColor: active ? "#0f172a" : "#e2e8f0" }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: active ? "#fff" : "#475569" }}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput placeholder="Observation / notes" value={r.notes ?? ""} onChangeText={(v) => setResponses((prev) => ({ ...prev, [it.id]: { ...prev[it.id], notes: v } }))} multiline style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, minHeight: 56, color: "#0f172a", backgroundColor: "#fff" }} />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput keyboardType="numeric" placeholder="Measured value" value={r.measuredValue !== undefined ? String(r.measuredValue) : ""} onChangeText={(v) => setResponses((prev) => ({ ...prev, [it.id]: { ...prev[it.id], measuredValue: v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined } }))} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
              <TextInput placeholder="Unit (m, kW)" value={r.measuredUnit ?? ""} onChangeText={(v) => setResponses((prev) => ({ ...prev, [it.id]: { ...prev[it.id], measuredUnit: v } }))} style={{ flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
            </View>

            <Text style={{ fontSize: 10, color: "#64748b" }}>Not Checked ≠ Pass. Pass requires actual check + supporting evidence.</Text>
          </View>
        );
      })}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={addItem} style={{ borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
          <Text style={{ fontWeight: "600", fontSize: 13, color: "#0f172a" }}>Add item</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving} style={{ backgroundColor: saving ? "#94a3b8" : "#0f172a", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{saving ? "Saving…" : "Save checklist responses"}</Text>
        </Pressable>
      </View>

      <Text style={{ fontSize: 11, color: "#64748b" }}>Edits are versioned per assessment. AI suggestions remain drafts until you accept. Calculations stay deterministic.</Text>
    </View>
  );
}
