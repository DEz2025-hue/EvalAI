import type { TextStyle } from "react-native";

/** Design tokens for the mobile app. Screens and components read from here instead of hard-coding values. */
export const colors = {
  bg: "#f8fafc",
  surface: "#ffffff",
  surfaceMuted: "#f1f5f9",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  divider: "#f1f5f9",

  text: "#0f172a",
  textMuted: "#64748b",
  textSubtle: "#94a3b8",
  textOnDark: "#ffffff",
  textOnDarkMuted: "#cbd5e1",

  brand: "#0f172a",
  brandSoft: "#1e293b",
  accent: "#0ea5e9",
  accentSoft: "#e0f2fe",
  accentText: "#0369a1",

  success: "#15803d",
  successSoft: "#dcfce7",
  warning: "#92400e",
  warningSoft: "#fef3c7",
  warningBorder: "#fde68a",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fecaca",
  info: "#3730a3",
  infoSoft: "#e0e7ff",
  disabled: "#94a3b8",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const typography = {
  display: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  heading: { fontSize: 15, fontWeight: "700", color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "600", color: colors.text },
  caption: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  overline: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
} satisfies Record<string, TextStyle>;

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted, border: colors.border },
  accent: { bg: colors.accentSoft, fg: colors.accentText, border: "#bae6fd" },
  success: { bg: colors.successSoft, fg: colors.success, border: "#bbf7d0" },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder },
  info: { bg: colors.infoSoft, fg: colors.info, border: "#c7d2fe" },
};

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

/** Shared header styling for every Stack/Tabs navigator. */
export const headerOptions = {
  headerStyle: { backgroundColor: colors.brand },
  headerTintColor: colors.textOnDark,
  headerTitleStyle: { fontWeight: "700" as const },
  headerShadowVisible: false,
};

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
