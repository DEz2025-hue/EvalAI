import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { checkStatus, colors, radius, space } from "../lib/theme";
import { Badge, Button, Icon, ProgressBar, Text } from "./ui";

type Item = { id: string; title: string; required: boolean };
type Resp = { itemId: string; status: string };

/**
 * Read-only view of the checklist on the job screen. Answers are recorded only in the walk-through, so there is one place
 * that saves them (and one set of rules); tapping an item opens the walk-through at that item.
 */
export function ChecklistSummaryMobile({ items, responses, base }: { items: Item[]; responses: Resp[]; base: string }) {
  const router = useRouter();
  const byItem = new Map(responses.map((r) => [r.itemId, r.status]));
  const statusOf = (id: string) => byItem.get(id) ?? "not_checked";
  const checked = items.filter((it) => statusOf(it.id) !== "not_checked").length;
  const requiredLeft = items.filter((it) => it.required && statusOf(it.id) === "not_checked").length;
  const open = (itemId?: string) => router.push((itemId ? `${base}/checklist?item=${encodeURIComponent(itemId)}` : `${base}/checklist`) as never);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <ProgressBar value={checked} total={items.length} />
        <Text variant="caption">
          {checked} of {items.length} checked{requiredLeft > 0 ? ` · ${requiredLeft} required still to do` : ""}
        </Text>
      </View>

      <Button title={checked === 0 ? "Start checking" : checked < items.length ? "Continue checking" : "Review answers"} icon="checkbox-outline" variant="accent" onPress={() => open()} />

      <View style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, overflow: "hidden" }}>
        {items.map((it, idx) => {
          const s = checkStatus(statusOf(it.id));
          return (
            <Pressable
              key={it.id}
              onPress={() => open(it.id)}
              accessibilityRole="button"
              accessibilityLabel={`${it.title}, ${s.label}${it.required ? ", required" : ""}`}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.divider, backgroundColor: pressed ? colors.surfaceMuted : colors.surface })}
            >
              <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>{it.title}</Text>
              {it.required && s.value === "not_checked" ? <Badge label="Required" tone="danger" /> : null}
              <Badge label={s.label} tone={s.tone} />
              <Icon name="chevron-forward" size={16} color={colors.textSubtle} />
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" color={colors.textSubtle}>Items you haven't checked never count as passed.</Text>
    </View>
  );
}
