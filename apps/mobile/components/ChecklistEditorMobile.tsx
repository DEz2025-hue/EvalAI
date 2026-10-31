import { useEffect, useState } from "react";
import { View, TextInput, Alert } from "react-native";
import { ChecklistStatus } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../lib/api";
import { CHECK_STATUSES, colors, radius, space } from "../lib/theme";
import { useKeyboardReveal } from "./keyboard";
import { Badge, Button, Chip, Field, Text } from "./ui";

type Item = { id: string; title: string; instructions?: string; required: boolean; category?: string };
type Response = { itemId: string; status: (typeof ChecklistStatus._type); notes?: string; measuredValue?: number; measuredUnit?: string };

export function ChecklistEditorMobile({ items: initial, assessmentId }: { items: Item[]; assessmentId: string }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [responses, setResponses] = useState<Record<string, Response>>(
    Object.fromEntries(initial.map((it) => [it.id, { itemId: it.id, status: "not_checked" as const }]))
  );
  const [saving, setSaving] = useState(false);
  const reveal = useKeyboardReveal();

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
        Alert.alert("Not saved", "Can't reach the server. Your answers stay on this screen but will be lost if you leave.");
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
      if (rows.length !== items.length) throw new Error("The checklist changed somewhere else — reopen this job before editing further.");
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
      Alert.alert("Saved", "Your checklist answers are saved.");
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

  const setResp = (id: string, patch: Partial<Response>) => setResponses((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <View style={{ gap: space.md }}>
      {items.map((it, idx) => {
        const r = responses[it.id] ?? { itemId: it.id, status: "not_checked" as const };
        return (
          <View key={it.id} style={{ gap: space.sm, paddingTop: idx === 0 ? 0 : space.md, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.divider }}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {it.required ? <Badge label="Required" tone="danger" /> : null}
              {it.category ? <Badge label={it.category} /> : null}
            </View>
            {it.id.startsWith("tmp-") ? (
              <TextInput onFocus={reveal} value={it.title} onChangeText={(v) => updateTitle(it.id, v)} placeholder="Item title" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, fontWeight: "600", color: colors.text, backgroundColor: colors.surface }} />
            ) : (
              <Text variant="bodyStrong">{it.title}</Text>
            )}
            {it.instructions ? <Text variant="caption">{it.instructions}</Text> : null}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {CHECK_STATUSES.map((s) => (
                <Chip key={s.value} label={s.label} icon={s.icon} tone={s.tone} active={r.status === s.value} onPress={() => updateStatus(it.id, s.value as Response["status"])} />
              ))}
            </View>

            <Field placeholder="Notes" value={r.notes ?? ""} onChangeText={(v) => setResp(it.id, { notes: v })} multiline />

            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 2 }}>
                <Field keyboardType="numeric" placeholder="Measurement" value={r.measuredValue !== undefined ? String(r.measuredValue) : ""} onChangeText={(v) => setResp(it.id, { measuredValue: v && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined })} />
              </View>
              <View style={{ flex: 1 }}>
                <Field placeholder="Unit" value={r.measuredUnit ?? ""} onChangeText={(v) => setResp(it.id, { measuredUnit: v })} />
              </View>
            </View>
          </View>
        );
      })}

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Add item" icon="add" variant="secondary" onPress={addItem} style={{ flex: 1 }} />
        <Button title={saving ? "Saving…" : "Save answers"} icon="save-outline" onPress={save} loading={saving} style={{ flex: 1 }} />
      </View>
      <Text variant="caption" color={colors.textSubtle}>Items you haven't checked never count as passed. Only mark Pass after you've actually checked it.</Text>
    </View>
  );
}
