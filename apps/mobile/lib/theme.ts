import { Appearance, type TextStyle } from "react-native";
import { GLASS, semanticColors, type SchemeName, type SemanticColors } from "@eval-ai/shared";

/**
 * Design tokens for the mobile app: Charcoal Black, Soft White and Pure White, in a light and a dark scheme
 * (the values live in packages/shared/src/theme.ts, which the web styles read too). Screens and components read from here
 * instead of hard-coding values.
 *
 * `colors`, `typography`, `tones`, `glass` and `headerOptions` are plain objects that screens import once. When the device
 * switches between light and dark, `applyScheme` rewrites them in place and the app root remounts its screens (see ThemeRoot in
 * app/_layout.tsx), so nothing needs to read a hook. Anything that copies a colour into a module-level constant would keep the old
 * value: build such objects inside a function instead.
 */
export const colors: SemanticColors = { ...semanticColors("light") };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Rounder than before: Liquid Glass uses large, concentric corners. */
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

function buildTypography() {
  return {
    display: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
    title: { fontSize: 18, fontWeight: "800", color: colors.text },
    heading: { fontSize: 15, fontWeight: "700", color: colors.text },
    body: { fontSize: 14, color: colors.text, lineHeight: 20 },
    bodyStrong: { fontSize: 14, fontWeight: "600", color: colors.text },
    caption: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    label: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
    overline: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  } satisfies Record<string, TextStyle>;
}
export const typography = buildTypography();

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

function buildTones(): Record<Tone, { bg: string; fg: string; border: string }> {
  return {
    neutral: { bg: colors.surfaceMuted, fg: colors.textMuted, border: colors.border },
    accent: { bg: colors.accentSoft, fg: colors.accentText, border: colors.border },
    success: { bg: colors.successSoft, fg: colors.success, border: colors.successBorder },
    warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder },
    info: { bg: colors.infoSoft, fg: colors.info, border: colors.infoBorder },
  };
}
export const tones = buildTones();

/** Liquid Glass fills and edges for the current scheme. */
export const glass = { ...GLASS.light };

function buildHeaderOptions() {
  return {
    // A frosted, nearly opaque bar with dark (or, in dark mode, light) text instead of the old solid dark header.
    headerStyle: { backgroundColor: glass.fillStrong },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: "700" as const, color: colors.text },
    headerShadowVisible: false,
  };
}
/** Shared header styling for every Stack/Tabs navigator. */
export const headerOptions = buildHeaderOptions();

let current: SchemeName = "light";

export function currentScheme(): SchemeName {
  return current;
}

/** Switch every token object to a scheme, in place. Safe to call on every render: it does nothing when the scheme is unchanged. */
export function applyScheme(scheme: SchemeName): void {
  if (scheme === current) return;
  current = scheme;
  Object.assign(colors, semanticColors(scheme));
  Object.assign(glass, GLASS[scheme]);
  const type = buildTypography();
  for (const key of Object.keys(type) as Array<keyof typeof type>) Object.assign(typography[key], type[key]);
  const t = buildTones();
  for (const key of Object.keys(t) as Tone[]) Object.assign(tones[key], t[key]);
  const header = buildHeaderOptions();
  Object.assign(headerOptions.headerStyle, header.headerStyle);
  Object.assign(headerOptions, { headerTintColor: header.headerTintColor });
  Object.assign(headerOptions.headerTitleStyle, header.headerTitleStyle);
}

/** The device's setting right now (anything but "dark" counts as light). */
export function systemScheme(): SchemeName {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

// Start in the device's scheme so the first screen is not drawn in the wrong colours.
applyScheme(systemScheme());

/** Job status → badge tone and a readable label. */
export function statusTone(status: string): { tone: Tone; label: string } {
  switch (status) {
    case "draft":
      return { tone: "warning", label: "Draft" };
    case "in_progress":
      return { tone: "accent", label: "In progress" };
    case "review":
      return { tone: "info", label: "In review" };
    case "finalized":
      return { tone: "success", label: "Finalized" };
    default:
      return { tone: "neutral", label: status.replace(/_/g, " ") };
  }
}

/** Checklist response statuses, in the order they are offered. "Not checked" never counts as a pass. */
export const CHECK_STATUSES = [
  { value: "not_checked", label: "Not checked", tone: "neutral", icon: "ellipse-outline" },
  { value: "pass", label: "Pass", tone: "success", icon: "checkmark-circle" },
  { value: "fail", label: "Issue", tone: "danger", icon: "close-circle" },
  { value: "needs_attention", label: "Needs attention", tone: "warning", icon: "alert-circle" },
  { value: "not_applicable", label: "N/A", tone: "info", icon: "remove-circle-outline" },
] as const satisfies ReadonlyArray<{ value: string; label: string; tone: Tone; icon: string }>;

export function checkStatus(value: string) {
  return CHECK_STATUSES.find((s) => s.value === value) ?? CHECK_STATUSES[0];
}
