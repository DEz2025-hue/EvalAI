import { useEffect, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, space } from "../lib/theme";

/**
 * Loading placeholders. A skeleton has the shape of the content that is coming, so the screen does not jump when it arrives.
 * All blocks on a screen pulse together from one shared animation. When the device asks for reduced motion they stay still.
 */

const native = Platform.OS !== "web";
const pulse = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => (reduceMotion = !!v)).catch(() => undefined);

function retain() {
  users += 1;
  if (users === 1 && !reduceMotion) {
    loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ]),
    );
    loop.start();
  }
}

function release() {
  users = Math.max(0, users - 1);
  if (users === 0) {
    loop?.stop();
    loop = null;
    pulse.setValue(0);
  }
}

/** One placeholder block. */
export function Skeleton({ width = "100%", height = 14, rounded = 8, style }: { width?: DimensionValue; height?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  useEffect(() => {
    retain();
    return release;
  }, []);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.border, opacity }, style]} />;
}

/** The wrapper for a group of placeholders: tells assistive technology what is loading. */
export function SkeletonGroup({ label = "Loading", children, style }: { label?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} importantForAccessibility="yes" style={style}>
      {children}
    </View>
  );
}

const LINE_WIDTHS: DimensionValue[] = ["100%", "92%", "78%", "86%", "64%"];

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ gap: 9 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 && lines > 1 ? "42%" : LINE_WIDTHS[i % LINE_WIDTHS.length]} />
      ))}
    </View>
  );
}

/** A list row: a small leading block, two lines, and a trailing pill. */
export function SkeletonRow({ last = false }: { last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}>
      <Skeleton width={34} height={34} rounded={radius.sm} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton height={13} width="58%" />
        <Skeleton height={10} width="34%" />
      </View>
      <Skeleton width={52} height={20} rounded={radius.pill} />
    </View>
  );
}

/** A card of rows, like a job or report list. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} last={i === rows - 1} />
      ))}
    </View>
  );
}

/** A card with a heading line and a few lines of text. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, gap: space.md }}>
      <Skeleton height={14} width="36%" />
      <SkeletonText lines={lines} />
    </View>
  );
}

/** Figure tiles (counts at the top of the home screen). */
export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md }}>
          <Skeleton height={22} width="45%" />
          <Skeleton height={10} width="70%" />
        </View>
      ))}
    </View>
  );
}
