import { ScrollView, View } from "react-native";
import { colors } from "../lib/theme";
import { Chip, Text } from "./ui";

export type ChipItem = { id: string; title: string };

/** Horizontal chip list for choosing a checklist item ("" = whole job). */
export function ItemChips({ label, items, value, onChange, allowNone = true }: { label: string; items: ChipItem[]; value: string; onChange: (id: string) => void; allowNone?: boolean }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" color={colors.text}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {allowNone ? <Chip label="Whole job" icon="briefcase-outline" tone="accent" active={value === ""} onPress={() => onChange("")} /> : null}
        {items.map((it) => (
          <Chip key={it.id} label={it.title.length > 32 ? it.title.slice(0, 31) + "…" : it.title} tone="accent" active={value === it.id} onPress={() => onChange(it.id)} />
        ))}
      </ScrollView>
    </View>
  );
}
