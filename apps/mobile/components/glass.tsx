import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { colors, currentScheme, glass, radius } from "../lib/theme";

/**
 * Liquid Glass for the phone.
 * - iPhone on iOS 26 or later: Apple's own glass effect (expo-glass-effect).
 * - Older iPhones and the web: a frosted blur (expo-blur) with a translucent fill and a light edge.
 * - Android, and anyone who has turned on "Reduce Transparency": a near-opaque solid surface, so text stays readable.
 */

function nativeGlassAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}
const NATIVE_GLASS = nativeGlassAvailable();

/** True when the person has asked the device to reduce transparency (iOS) — glass then becomes a solid surface. */
export function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => alive && setReduce(!!v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceTransparencyChanged", (v: boolean) => setReduce(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

type Edge = "all" | "top" | "bottom" | "none";

export type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `strong` is more opaque, for surfaces that carry a lot of text (cards, sheets, bars). */
  intensity?: "regular" | "strong";
  /** Which sides get the light edge line. */
  edge?: Edge;
  /** Corner radius. Defaults to the large glass radius; pass 0 for a full-width bar. */
  cornerRadius?: number;
  /** Lets the glass react to touch (iOS 26 only). */
  interactive?: boolean;
  /** A soft drop shadow under the surface (not on bars that sit on the screen edge). */
  elevated?: boolean;
};

export function GlassSurface({ children, style, intensity = "strong", edge = "all", cornerRadius = radius.lg, interactive = false, elevated = false }: GlassSurfaceProps) {
  const reduce = useReduceTransparency();
  const scheme = currentScheme();
  const solid = Platform.OS === "android" || reduce;
  const fill = intensity === "strong" ? glass.fillStrong : glass.fill;

  const edges: ViewStyle = {
    borderRadius: cornerRadius,
    borderColor: glass.edge,
    borderTopWidth: edge === "all" || edge === "top" ? StyleSheet.hairlineWidth : 0,
    borderBottomWidth: edge === "all" || edge === "bottom" ? StyleSheet.hairlineWidth : 0,
    borderLeftWidth: edge === "all" ? StyleSheet.hairlineWidth : 0,
    borderRightWidth: edge === "all" ? StyleSheet.hairlineWidth : 0,
  };
  const shadow: ViewStyle | null = elevated ? { shadowColor: "#000", shadowOpacity: scheme === "dark" ? 0.45 : 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 4 } : null;

  if (solid) {
    return <View style={[{ backgroundColor: colors.surface, overflow: "hidden" }, edges, shadow, style]}>{children}</View>;
  }

  if (NATIVE_GLASS) {
    return (
      <View style={[{ overflow: "hidden" }, edges, shadow, style]}>
        <GlassView glassEffectStyle={intensity === "strong" ? "regular" : "clear"} colorScheme={scheme} isInteractive={interactive} style={StyleSheet.absoluteFill} />
        {children}
      </View>
    );
  }

  return (
    <View style={[{ overflow: "hidden" }, edges, shadow, style]}>
      <BlurView intensity={intensity === "strong" ? 55 : 35} tint={scheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {children}
    </View>
  );
}
