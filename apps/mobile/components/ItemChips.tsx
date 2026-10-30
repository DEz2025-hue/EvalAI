import { Pressable, ScrollView, Text, View } from "react-native";

export type ChipItem = { id: string; title: string };

/** Horizontal chip list for choosing a checklist item ("" = whole job). */
export function ItemChips({ label, items, value, onChange, allowNone = true }: { label: string; items: ChipItem[]; value: string; onChange: (id: string) => void; allowNone?: boolean }) {
  if (items.length === 0) return null;
  const chip = (id: string, text: string) => {
    const active = value === id;
    return (
      <Pressable key={id || "none"} onPress={() => onChange(id)} accessibilityRole="button" accessibilityState={{ selected: active }}
        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? "#0ea5e9" : "#e2e8f0", backgroundColor: active ? "#e0f2fe" : "#fff", maxWidth: 220 }}>
        <Text numberOfLines={1} style={{ fontSize: 11, color: active ? "#0369a1" : "#334155", fontWeight: active ? "700" : "500" }}>{text}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "#0f172a" }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {allowNone ? chip("", "Whole job") : null}
        {items.map((it) => chip(it.id, it.title))}
      </ScrollView>
    </View>
  );
}
