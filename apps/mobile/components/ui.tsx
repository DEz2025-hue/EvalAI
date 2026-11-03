import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, space, statusTone, tones, typography, type Tone } from "../lib/theme";
import { KeyboardScroll, useKeyboardReveal } from "./keyboard";
import { GlassSurface } from "./glass";
import { SkeletonCard, SkeletonGroup, SkeletonList, SkeletonRow, SkeletonText } from "./skeleton";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

/* ---------- Text ---------- */

type Variant = keyof typeof typography;

export function Text({ variant = "body", color, style, ...rest }: ComponentProps<typeof RNText> & { variant?: Variant; color?: string }) {
  return <RNText {...rest} style={[typography[variant], color ? { color } : null, style]} />;
}

/* ---------- Layout ---------- */

/** How much room the floating tab bar takes at the bottom of a screen (0 outside the tabs). Set by the tab layout. */
export const TabBarInsetContext = createContext(0);

/** Scrollable screen body with standard padding and optional pull-to-refresh. Keeps the focused field above the keyboard. */
export function Screen({ children, onRefresh, refreshing = false, contentStyle }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const tabInset = useContext(TabBarInsetContext);
  return (
    <KeyboardScroll
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[{ padding: space.lg, gap: space.md, paddingBottom: space.xxl + tabInset }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
    >
      {children}
    </KeyboardScroll>
  );
}

/** A content card. Solid by default (long lists stay readable and cheap to draw); pass `glass` for a Liquid Glass card. */
export function Card({ children, style, padded = true, glass = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; glass?: boolean }) {
  if (glass) {
    return (
      <GlassSurface cornerRadius={radius.md} elevated style={[padded ? { padding: space.lg, gap: space.md } : null, style]}>
        {children}
      </GlassSurface>
    );
  }
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
        padded ? { padding: space.lg, gap: space.md } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/* ---------- Buttons ---------- */

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";

function buttonColors(variant: ButtonVariant): { bg: string; fg: string; border: string } {
  switch (variant) {
    case "primary":
      return { bg: colors.brand, fg: colors.onBrand, border: colors.brand };
    case "accent":
      return { bg: colors.accent, fg: colors.onBrand, border: colors.accent };
    case "secondary":
      return { bg: colors.surface, fg: colors.text, border: colors.border };
    case "ghost":
      return { bg: "transparent", fg: colors.text, border: "transparent" };
    case "danger":
      return { bg: colors.surface, fg: colors.danger, border: colors.dangerBorder };
  }
}

export const Button = forwardRef<ComponentRef<typeof View>, {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}>(function Button({ title, onPress, variant = "primary", size = "md", icon, loading, disabled, fullWidth, style }, ref) {
  const c = buttonColors(variant);
  const off = disabled || loading;
  const pad = size === "sm" ? { paddingVertical: 7, paddingHorizontal: 12 } : size === "lg" ? { paddingVertical: 14, paddingHorizontal: 18 } : { paddingVertical: 11, paddingHorizontal: 16 };
  const fontSize = size === "sm" ? 12 : 14;
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        {
          ...pad,
          backgroundColor: off && variant !== "ghost" ? (variant === "secondary" || variant === "danger" ? colors.surfaceMuted : colors.disabled) : c.bg,
          borderWidth: 1,
          borderColor: off && variant !== "ghost" ? "transparent" : c.border,
          borderRadius: radius.pill,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: pressed ? 0.85 : 1,
        },
        fullWidth ? { alignSelf: "stretch" } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={variant === "secondary" || variant === "ghost" || variant === "danger" ? c.fg : colors.onBrand} /> : icon ? <Icon name={icon} size={fontSize + 3} color={off ? colors.textMuted : c.fg} /> : null}
      <Text style={{ fontSize, fontWeight: "700", color: off && variant !== "primary" && variant !== "accent" ? colors.textMuted : c.fg }}>{title}</Text>
    </Pressable>
  );
});

/* ---------- Inputs ---------- */

export function Field({ label, hint, error, right, required, style, ...input }: TextInputProps & { label?: string; hint?: string; error?: string | null; right?: ReactNode; required?: boolean }) {
  const reveal = useKeyboardReveal();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" color={colors.text}>
          {label}
          {required ? <Text variant="label" color={colors.danger}> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: input.multiline ? "flex-start" : "center",
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.border,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
        }}
      >
        <TextInput
          placeholderTextColor={colors.textSubtle}
          {...input}
          onFocus={(e) => {
            reveal();
            input.onFocus?.(e);
          }}
          style={[{ flex: 1, paddingHorizontal: space.md, paddingVertical: 11, fontSize: 15, color: colors.text }, input.multiline ? { minHeight: 80, textAlignVertical: "top" } : null, style as StyleProp<TextStyle>]}
        />
        {right}
      </View>
      {error ? <Text variant="caption" color={colors.danger}>{error}</Text> : hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

/** Pill input with a leading search icon and a clear button. */
export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, paddingHorizontal: space.md }}>
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8} accessibilityLabel="Clear search">
          <Icon name="close-circle" size={18} color={colors.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------- Selection ---------- */

/** Toggle pill. With a `tone`, the active state uses that tone's colours instead of the brand fill. */
export function Chip({ label, active, onPress, tone, icon }: { label: string; active: boolean; onPress: () => void; tone?: Tone; icon?: IconName }) {
  const t = tone ? tones[tone] : null;
  const bg = active ? (t ? t.bg : colors.brand) : colors.surface;
  const border = active ? (t ? t.fg : colors.brand) : colors.border;
  const fg = active ? (t ? t.fg : colors.onBrand) : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: bg, borderWidth: 1, borderColor: border }}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={{ fontSize: 12, fontWeight: "600", color: fg }}>{label}</Text>
    </Pressable>
  );
}

export const IconButton = forwardRef<ComponentRef<typeof View>, { icon: IconName; onPress?: () => void; label: string; tone?: "default" | "danger"; disabled?: boolean }>(function IconButton({ icon, onPress, label, tone = "default", disabled }, ref) {
  const danger = tone === "danger";
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: danger ? colors.dangerBorder : colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : danger ? colors.dangerSoft : colors.surface,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
    </Pressable>
  );
});

/** Square shortcut tile with an icon and label (job hub navigation). */
export const NavTile = forwardRef<ComponentRef<typeof View>, { icon: IconName; label: string; onPress?: () => void; badge?: string }>(function NavTile({ icon, label, onPress, badge }, ref) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexBasis: "30%",
        flexGrow: 1,
        alignItems: "center",
        gap: 6,
        paddingVertical: space.md,
        paddingHorizontal: space.xs,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
      })}
    >
      <Icon name={icon} size={22} color={colors.accentText} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text, textAlign: "center" }} numberOfLines={1}>{label}</Text>
      {badge ? <Text style={{ fontSize: 10, color: colors.textMuted }}>{badge}</Text> : null}
    </Pressable>
  );
});

export function Stat({ value, label, tone }: { value: number | string; label: string; tone?: Tone }) {
  return (
    <View style={{ flexBasis: "30%", flexGrow: 1, gap: 2 }}>
      <Text variant="title" color={tone ? tones[tone].fg : colors.text}>{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, total, tone = "accent" }: { value: number; total: number; tone?: Tone }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: "hidden" }}>
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: tones[tone].fg, borderRadius: radius.pill }} />
    </View>
  );
}

/** Large tappable choice card (used for mode/pack pickers). */
export function OptionCard({ title, subtitle, icon, selected, onPress }: { title: string; subtitle?: string; icon?: IconName; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={{
        flex: 1,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        gap: 4,
      }}
    >
      {icon ? <Icon name={icon} size={22} color={selected ? colors.accentText : colors.textMuted} /> : null}
      <Text variant="bodyStrong" color={selected ? colors.accentText : colors.text}>{title}</Text>
      {subtitle ? <Text variant="caption" numberOfLines={2}>{subtitle}</Text> : null}
    </Pressable>
  );
}

/* ---------- Status & feedback ---------- */

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: t.fg }}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = statusTone(status);
  return <Badge label={s.label} tone={s.tone} />;
}

const bannerIcon: Record<Tone, IconName> = {
  neutral: "information-circle",
  accent: "information-circle",
  info: "information-circle",
  success: "checkmark-circle",
  warning: "alert-circle",
  danger: "close-circle",
};

export function Banner({ tone = "info", title, message, action }: { tone?: Tone; title?: string; message: string; action?: ReactNode }) {
  const t = tones[tone];
  return (
    <View style={{ flexDirection: "row", gap: space.sm, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: space.md }}>
      <Icon name={bannerIcon[tone]} size={18} color={t.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text variant="bodyStrong" color={t.fg} style={{ fontSize: 13 }}>{title}</Text> : null}
        <Text variant="caption" color={t.fg}>{message}</Text>
        {action ? <View style={{ marginTop: space.sm, alignSelf: "flex-start" }}>{action}</View> : null}
      </View>
    </View>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xl, paddingHorizontal: space.lg, gap: space.sm }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={26} color={colors.textMuted} />
      </View>
      <Text variant="heading" style={{ textAlign: "center" }}>{title}</Text>
      {message ? <Text variant="caption" style={{ textAlign: "center", maxWidth: 300 }}>{message}</Text> : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

/**
 * The loading state of a screen or a section: placeholders in the shape of what is coming, not a spinner.
 * `variant` picks the shape: "list" (rows, the default), "card" (a heading and text), "text" (a few lines) or "inline"
 * (one row, for a small area). The label is read out by screen readers.
 */
export function Loading({ label, variant = "list", rows }: { label?: string; variant?: "list" | "card" | "text" | "inline"; rows?: number }) {
  return (
    <SkeletonGroup label={label ?? "Loading"} style={{ paddingVertical: variant === "inline" ? space.sm : space.xs }}>
      {variant === "list" ? <SkeletonList rows={rows ?? 4} /> : variant === "card" ? <SkeletonCard lines={rows ?? 3} /> : variant === "text" ? <SkeletonText lines={rows ?? 3} /> : <SkeletonRow last />}
    </SkeletonGroup>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <Banner
      tone="danger"
      title={title}
      message={message}
      action={onRetry ? <Button title="Try again" icon="refresh" size="sm" variant="danger" onPress={onRetry} /> : undefined}
    />
  );
}

/* ---------- Lists ---------- */

export const ListRow = forwardRef<ComponentRef<typeof View>, {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: IconName;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  chevron?: boolean;
}>(function ListRow({ title, subtitle, meta, icon, iconColor, right, onPress, destructive, last, chevron = !!onPress }, ref) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.divider,
      })}
    >
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: destructive ? colors.dangerSoft : colors.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} color={iconColor ?? (destructive ? colors.danger : colors.text)} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={destructive ? colors.danger : undefined} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" numberOfLines={1}>{subtitle}</Text> : null}
        {meta ? <Text style={{ fontSize: 11, color: colors.textSubtle }}>{meta}</Text> : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={colors.textSubtle} /> : null}
    </Pressable>
  );
});

/* ---------- Dropdown ---------- */

export type SelectOption = { value: string; label: string; description?: string; icon?: IconName };

/**
 * Drives a bottom sheet: the dim backdrop fades while the sheet slides up on its own, instead of the whole screen sliding
 * (which is what the Modal's built-in "slide" does and what looked wrong). `progress` is 0 closed, 1 open. `mounted` keeps the
 * Modal on screen while the closing animation plays.
 */
function useBottomSheet() {
  const [mounted, setMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== "web";
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const open = useCallback(() => {
    running.current?.stop();
    setMounted(true);
    running.current = Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: native });
    running.current.start();
  }, [progress, native]);

  const close = useCallback(() => {
    running.current?.stop();
    running.current = Animated.timing(progress, { toValue: 0, duration: 190, easing: Easing.in(Easing.cubic), useNativeDriver: native });
    running.current.start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [progress, native]);

  useEffect(() => () => running.current?.stop(), []);
  return { mounted, progress, open, close };
}

/** Field-styled dropdown that opens a bottom sheet of options. Used where the list can grow (e.g. systems). */
export function Select({ label, title, value, options, onChange, placeholder = "Choose…" }: { label?: string; title?: string; value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder?: string }) {
  const sheet = useBottomSheet();
  const { height: windowHeight } = useWindowDimensions();
  const current = options.find((o) => o.value === value);
  const slide = sheet.progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight * 0.7, 0] });
  const chevron = sheet.progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="label" color={colors.text}>{label}</Text> : null}
      <Pressable
        onPress={sheet.open}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${current?.label ?? placeholder}` : current?.label ?? placeholder}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
          paddingVertical: 11,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        })}
      >
        {current?.icon ? <Icon name={current.icon} size={18} color={colors.accentText} /> : null}
        <Text variant="body" color={current ? colors.text : colors.textSubtle} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Animated.View style={{ transform: [{ rotate: chevron }] }}>
          <Icon name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      <Modal visible={sheet.mounted} transparent animationType="none" statusBarTranslucent onRequestClose={sheet.close}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(21,21,21,0.45)", opacity: sheet.progress }} />
          <Pressable onPress={sheet.close} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLabel="Close" />
          <Animated.View style={{ borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: "hidden", paddingBottom: space.xl, maxHeight: "70%", transform: [{ translateY: slide }] }}>
            <GlassSurface edge="top" cornerRadius={0} style={StyleSheet.absoluteFill} />
            <View style={{ alignItems: "center", paddingTop: space.sm }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.md }}>
              <Text variant="heading" style={{ flex: 1 }}>{title ?? label ?? "Choose"}</Text>
              <IconButton icon="close" label="Close" onPress={sheet.close} />
            </View>
            <ScrollView>
              {options.map((o, i) => {
                const selected = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => { onChange(o.value); sheet.close(); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.md,
                      paddingHorizontal: space.lg,
                      paddingVertical: space.md,
                      backgroundColor: selected ? colors.accentSoft : pressed ? colors.surfaceMuted : "transparent",
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.divider,
                    })}
                  >
                    {o.icon ? (
                      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: selected ? colors.surface : colors.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
                        <Icon name={o.icon} size={20} color={selected ? colors.accentText : colors.text} />
                      </View>
                    ) : null}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" color={selected ? colors.accentText : colors.text}>{o.label}</Text>
                      {o.description ? <Text variant="caption" numberOfLines={2}>{o.description}</Text> : null}
                    </View>
                    {selected ? <Icon name="checkmark-circle" size={22} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
