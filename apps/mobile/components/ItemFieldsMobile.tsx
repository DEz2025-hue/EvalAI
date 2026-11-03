import { useState } from "react";
import { View } from "react-native";
import { cleanAnswers, fieldsFor, parseMeasurement, type FieldSuggestion } from "@eval-ai/shared";
import { colors, radius, space } from "../lib/theme";
import { Button, Chip, Field, Text } from "./ui";

/** The simple answer fields of a checklist item (D-042): tap a choice to set it, tap it again to clear it, and type numbers. AI suggestions wait for a tap. */
export function ItemFieldsMobile({ title, answers, onChange, suggestions = [], onDismiss }: { title: string; answers: unknown; onChange: (key: string, value: string | number | undefined) => void; suggestions?: FieldSuggestion[]; onDismiss?: (key: string) => void }) {
  // What was typed in each number field, so unfinished input like "2." stays on screen while typing.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const set = fieldsFor(title);
  if (!set) return null;
  const clean = cleanAnswers(title, answers);
  return (
    <View style={{ gap: space.md }}>
      {set.fields.map((f) => {
        const suggestion = suggestions.find((s) => s.key === f.key && clean[f.key] === undefined);
        const label = f.label + (f.required === false ? " (optional)" : "");
        return (
          <View key={f.key} style={{ gap: space.xs }}>
            {f.type === "choice" ? (
              <>
                <Text variant="label" color={colors.text}>{label}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {f.options.map((o) => {
                    const on = clean[f.key] === o;
                    return <Chip key={o} label={o} tone={on && f.concern?.includes(o) ? "warning" : undefined} active={on} onPress={() => onChange(f.key, on ? undefined : o)} />;
                  })}
                </View>
              </>
            ) : (
              <Field
                label={`${label}, ${f.unit}`}
                keyboardType="decimal-pad"
                value={typed[f.key] ?? (clean[f.key] !== undefined ? String(clean[f.key]) : "")}
                onChangeText={(v) => {
                  setTyped((m) => ({ ...m, [f.key]: v }));
                  onChange(f.key, parseMeasurement(v));
                }}
              />
            )}
            {suggestion ? (
              <View style={{ gap: space.xs, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: space.sm }}>
                <Text variant="caption">AI suggests: {suggestion.value}{suggestion.quote ? ` (from your note: "${suggestion.quote}")` : ""}. Use it?</Text>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Button title="Use" variant="secondary" size="sm" onPress={() => onChange(f.key, suggestion.value)} />
                  {onDismiss ? <Button title="Dismiss" variant="ghost" size="sm" onPress={() => onDismiss(f.key)} /> : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {set.photoRequired ? <Text variant="caption">A photo is required for this item before the report can be signed off.</Text> : null}
    </View>
  );
}
