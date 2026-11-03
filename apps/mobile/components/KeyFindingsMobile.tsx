import { View } from "react-native";
import { FINDING_PRIORITIES, KEY_FINDING_LIMITS, PRIORITY_LABEL, type FindingPriority, type ReportKeyFinding } from "@eval-ai/shared";
import { colors, radius, space, type Tone } from "../lib/theme";
import { Badge, Button, Card, Chip, Field, Text } from "./ui";

const TONE: Record<FindingPriority, Tone> = { high: "danger", medium: "warning", low: "info", info: "neutral" };

/** Sources in plain words. Photos are shown by their number in the report. */
function sources(f: ReportKeyFinding, photoNumber: Map<string, number>): string[] {
  return f.basis
    .map((b) => (b.kind === "photo" ? (photoNumber.has(b.ref) ? `Photo ${photoNumber.get(b.ref)}` : "") : (b.kind === "item" ? "Checklist: " : b.kind === "measurement" ? "Measurement: " : "Finding: ") + b.ref))
    .filter(Boolean);
}

/** A key finding as the reader sees it: what was observed, what it means (interpretation) and what to do. */
export function KeyFindingView({ finding: f, index, photoNumber }: { finding: ReportKeyFinding; index: number; photoNumber: Map<string, number> }) {
  const src = sources(f, photoNumber);
  const status = f.confirmed ? "Confirmed by the reviewer" : f.source === "ai" ? "AI draft — not yet confirmed" : "";
  return (
    <View style={{ gap: 4, paddingVertical: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Text variant="bodyStrong" style={{ flexShrink: 1 }}>{index}. {f.title}</Text>
        <Badge label={PRIORITY_LABEL[f.priority]} tone={TONE[f.priority]} />
      </View>
      {status ? <Text variant="caption" color={colors.textMuted}>{status}</Text> : null}
      {f.observed ? <Text variant="caption" color={colors.text}><Text variant="caption" style={{ fontWeight: "700" }}>Observed. </Text>{f.observed}</Text> : null}
      {f.meaning ? <Text variant="caption" color={colors.text}><Text variant="caption" style={{ fontWeight: "700" }}>What it means (interpretation). </Text>{f.meaning}</Text> : null}
      {f.action ? <Text variant="caption" color={colors.text}><Text variant="caption" style={{ fontWeight: "700" }}>Recommended action. </Text>{f.action}</Text> : null}
      {src.length ? <Text variant="caption" color={colors.textMuted}>Based on: {src.join(" · ")}</Text> : null}
    </View>
  );
}

/**
 * Edit the report's key findings on the phone. The AI drafts them; the person corrects the wording, changes the priority, removes what
 * doesn't hold up, adds their own, and marks a finding confirmed once they have checked it against the evidence.
 */
export function KeyFindingsEditorMobile({ value, onChange, photoNumber }: { value: ReportKeyFinding[]; onChange: (next: ReportKeyFinding[]) => void; photoNumber: Map<string, number> }) {
  const L = KEY_FINDING_LIMITS;
  const patch = (i: number, p: Partial<ReportKeyFinding>) => onChange(value.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const add = () => onChange([...value, { id: `p${Date.now()}`, title: "", priority: "medium", observed: "", meaning: "", action: "", basis: [], source: "person" }]);

  return (
    <View style={{ gap: space.md }}>
      <Text variant="label" color={colors.text}>Key findings</Text>
      <Text variant="caption">Related observations, measurements and photos combined into one finding each. "What it means" is interpretation and may use general technical knowledge: check it, and mark the finding confirmed when you have.</Text>
      {value.length === 0 ? <Text variant="caption" color={colors.textMuted}>No written findings yet. The report lists confirmed findings and items marked Issue or Needs attention until you add or draft some.</Text> : null}
      {value.map((f, i) => {
        const src = sources(f, photoNumber);
        return (
          <Card key={f.id} style={{ gap: space.sm }}>
            <Field label={`Finding ${i + 1} title`} value={f.title} onChangeText={(t) => patch(i, { title: t })} maxLength={L.title} placeholder="Short title for this finding" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {FINDING_PRIORITIES.map((p) => (
                <Chip key={p} label={PRIORITY_LABEL[p]} tone={TONE[p]} active={f.priority === p} onPress={() => patch(i, { priority: p })} />
              ))}
            </View>
            <Field label="Observed" multiline value={f.observed} onChangeText={(t) => patch(i, { observed: t })} maxLength={L.observed} />
            <Field label="What it means (interpretation)" multiline value={f.meaning} onChangeText={(t) => patch(i, { meaning: t })} maxLength={L.meaning} />
            <Field label="Recommended action" multiline value={f.action} onChangeText={(t) => patch(i, { action: t })} maxLength={L.action} />
            {src.length ? <Text variant="caption" color={colors.textMuted}>Based on: {src.join(" · ")}</Text> : null}
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
              <Chip label={f.confirmed ? "Confirmed by me" : "Mark as confirmed"} icon={f.confirmed ? "checkmark-circle" : "ellipse-outline"} tone="success" active={!!f.confirmed} onPress={() => patch(i, { confirmed: !f.confirmed })} />
              {f.source === "ai" && !f.confirmed ? <Badge label="AI draft" tone="warning" /> : null}
              <View style={{ flex: 1 }} />
              <Button title="Remove" icon="trash-outline" variant="ghost" size="sm" onPress={() => onChange(value.filter((_, j) => j !== i))} />
            </View>
          </Card>
        );
      })}
      <Button title="Add a finding" icon="add" variant="secondary" size="sm" onPress={add} disabled={value.length >= L.max} style={{ borderRadius: radius.sm }} />
    </View>
  );
}
