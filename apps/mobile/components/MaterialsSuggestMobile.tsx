import { useState } from "react";
import { Pressable, View } from "react-native";
import { QUANTITY_TBD } from "@eval-ai/shared";
import { apiFetch } from "../lib/api";
import { colors, space } from "../lib/theme";
import { Badge, Banner, Button, Card, Field, Icon, SectionHeader, Text } from "./ui";

export type SuggestedItem = { id: string; description: string; specification?: string; quantity: number; unit: string; rationale: string; source: "ai_suggested"; provisional: boolean; assumptions: string[] };

type DraftItem = { group: string; description: string; specification: string; quantity: number; unit: string; rationale: string; provisional: boolean; assumptions: string[]; quantityTbd: boolean; method: "rule" | "estimate" | "unknown" };
type Draft = { designBasis: string; items: DraftItem[]; missingInputs: string[]; duplicates: string[]; unverifiedFigures: string[]; label: string };
type Row = DraftItem & { keep: boolean; qtyText: string };

/** "Suggest materials with AI" on the phone (D-029): review the proposal, keep or drop each item, set a quantity where it is TBD, add to the list. Nothing is saved or priced here. */
export function MaterialsSuggestMobile({ assessmentId, onAdd }: { assessmentId: string; onAdd: (items: SuggestedItem[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/ai/materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId }), timeoutMs: 70_000 });
      const data = (await res.json().catch(() => ({}))) as Draft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The AI could not suggest materials");
      setDraft(data);
      setRows(data.items.map((i) => ({ ...i, keep: true, qtyText: i.quantityTbd ? "" : String(i.quantity) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  function add() {
    const picked = rows.filter((r) => r.keep).map((r, n): SuggestedItem => {
      const typed = Number(r.qtyText);
      const entered = r.qtyText.trim() !== "" && Number.isFinite(typed) && typed > 0;
      const stillTbd = r.quantityTbd && !entered;
      const changed = entered && (r.quantityTbd || typed !== r.quantity);
      const assumptions = [...r.assumptions.filter((a) => !(entered && r.quantityTbd && a.startsWith(QUANTITY_TBD))), ...(changed ? ["Quantity entered by the reviewer"] : [])];
      return { id: `tmp-ai-${Date.now()}-${n}`, description: r.description, specification: r.specification || undefined, quantity: stillTbd ? 1 : entered ? typed : r.quantity, unit: r.unit, rationale: r.rationale, source: "ai_suggested", provisional: r.provisional || stillTbd || changed, assumptions };
    });
    onAdd(picked);
    setDraft(null);
    setRows([]);
  }

  const kept = rows.filter((r) => r.keep).length;
  return (
    <Card>
      <SectionHeader title="Suggest materials" subtitle="The AI reads the whole job and proposes materials. Nothing is priced or saved until you add them and save." />
      <Button title={busy ? "Analysing the job…" : draft ? "Run again" : "Suggest materials with AI"} icon="sparkles-outline" variant="accent" onPress={run} loading={busy} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {draft ? (
        <View style={{ gap: space.md }}>
          <View style={{ gap: 4 }}>
            <Text variant="bodyStrong">What the AI assumed</Text>
            <Text variant="caption">{draft.designBasis || "—"}</Text>
          </View>
          {draft.missingInputs.length > 0 ? <Banner tone="warning" title="Add these and run again for firmer quantities" message={draft.missingInputs.join("\n")} /> : null}
          {draft.duplicates.length > 0 ? <Text variant="caption" color={colors.textSubtle}>Already on your list: {draft.duplicates.join(", ")}.</Text> : null}
          {draft.unverifiedFigures.length > 0 ? <Banner tone="warning" message={`Check these figures, they are not in the job record: ${draft.unverifiedFigures.join(", ")}.`} /> : null}
          {rows.map((r, i) => (
            <View key={i} style={{ gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.divider, opacity: r.keep ? 1 : 0.5 }}>
              <Pressable onPress={() => patch(i, { keep: !r.keep })} accessibilityRole="checkbox" accessibilityState={{ checked: r.keep }} accessibilityLabel={`Add ${r.description}`} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                <Icon name={r.keep ? "checkbox" : "square-outline"} color={r.keep ? colors.accent : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color={colors.textSubtle}>{r.group}</Text>
                  <Text variant="bodyStrong">{r.description}</Text>
                </View>
              </Pressable>
              {r.specification ? <Text variant="caption">{r.specification}</Text> : null}
              <Field label={`Quantity (${r.unit})`} value={r.qtyText} onChangeText={(v) => patch(i, { qtyText: v })} keyboardType="decimal-pad" placeholder="TBD" hint={r.method === "rule" ? "Calculated from a rule" : r.method === "estimate" ? "AI estimate" : "Quantity unknown"} />
              <Text variant="caption">{r.rationale}</Text>
              {r.assumptions.map((a, k) => <Text key={k} variant="caption" color={colors.textSubtle}>• {a}</Text>)}
              {r.provisional || r.quantityTbd ? <Badge label={r.quantityTbd ? "TBD" : "Provisional"} tone="warning" /> : null}
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title={`Add ${kept} to list`} icon="add" variant="primary" disabled={kept === 0} onPress={add} style={{ flex: 1 }} />
            <Button title="Discard" variant="secondary" onPress={() => { setDraft(null); setRows([]); }} style={{ flex: 1 }} />
          </View>
          <Text variant="caption" color={colors.textSubtle}>{draft.label}</Text>
        </View>
      ) : null}
    </Card>
  );
}
