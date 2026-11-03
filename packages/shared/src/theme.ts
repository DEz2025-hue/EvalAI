// Design tokens for the monochrome identity: Charcoal Black, Soft White and Pure White, with Liquid Glass surfaces.
// One source of truth. The phone reads these values directly; the web has the same values as CSS variables in
// apps/web/app/globals.css, and a test fails if the two drift apart.

export const BRAND = { charcoal: "#151515", softWhite: "#F6F6F6", pureWhite: "#FDFDFD" } as const;

export type SchemeName = "light" | "dark";
export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type Scale = Record<Shade, string>;
export const SHADES: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/** The grey scale. Every neutral and every accent family of the old theme (slate, teal, sky, indigo) maps to it. */
export const NEUTRAL: Record<SchemeName, Scale> = {
  light: { 50: "#F6F6F6", 100: "#EEEEEE", 200: "#E2E2E2", 300: "#CFCFCF", 400: "#8A8A8A", 500: "#6B6B6B", 600: "#565656", 700: "#3F3F3F", 800: "#2A2A2A", 900: "#151515" },
  dark: { 50: "#1B1B1B", 100: "#232323", 200: "#303030", 300: "#424242", 400: "#7A7A7A", 500: "#A3A3A3", 600: "#B8B8B8", 700: "#CFCFCF", 800: "#E6E6E6", 900: "#F6F6F6" },
};

/** Status colours stay functional (pass, issue, needs attention) and always come with an icon and a text label. */
export const STATUS = {
  red: {
    light: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d" },
    dark: { 50: "#2B1717", 100: "#3A1D1D", 200: "#532626", 300: "#7C3636", 400: "#E07878", 500: "#EB8A8A", 600: "#F28B8B", 700: "#F5A3A3", 800: "#F8B8B8", 900: "#FBD0D0" },
  },
  amber: {
    light: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" },
    dark: { 50: "#2B2210", 100: "#3A2E12", 200: "#54421A", 300: "#7C6125", 400: "#D9A93E", 500: "#E5B656", 600: "#EDBE5C", 700: "#F2CB7B", 800: "#F6D99B", 900: "#FAE8C2" },
  },
  green: {
    light: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d" },
    dark: { 50: "#14261A", 100: "#1A3322", 200: "#234A2F", 300: "#2F6A42", 400: "#4CB36E", 500: "#62C382", 600: "#6FCB8C", 700: "#8BD8A3", 800: "#A9E4BB", 900: "#C9EFD5" },
  },
} as const satisfies Record<string, Record<SchemeName, Scale>>;

/** The page behind everything, and the solid surface used where glass cannot be (and by `bg-white`). */
export const SURFACES: Record<SchemeName, { page: string; surface: string }> = {
  light: { page: BRAND.softWhite, surface: BRAND.pureWhite },
  dark: { page: BRAND.charcoal, surface: "#1F1F1F" },
};

/** Liquid Glass: a translucent fill, a light edge, and the blur behind it. */
export const GLASS: Record<SchemeName, { fill: string; fillStrong: string; edge: string; highlight: string; shadow: string; blur: number; saturate: number }> = {
  light: { fill: "rgba(253,253,253,0.72)", fillStrong: "rgba(253,253,253,0.88)", edge: "rgba(21,21,21,0.08)", highlight: "rgba(255,255,255,0.85)", shadow: "rgba(21,21,21,0.10)", blur: 24, saturate: 1.8 },
  dark: { fill: "rgba(253,253,253,0.08)", fillStrong: "rgba(253,253,253,0.12)", edge: "rgba(253,253,253,0.14)", highlight: "rgba(253,253,253,0.18)", shadow: "rgba(0,0,0,0.45)", blur: 24, saturate: 1.6 },
};

/** The phone's named colours (same keys the app has always used), derived from the scales above. */
export function semanticColors(scheme: SchemeName) {
  const n = NEUTRAL[scheme];
  const s = SURFACES[scheme];
  const r = STATUS.red[scheme];
  const a = STATUS.amber[scheme];
  const g = STATUS.green[scheme];
  const dark = scheme === "dark";
  return {
    bg: s.page,
    surface: s.surface,
    surfaceMuted: n[100],
    border: n[200],
    borderStrong: n[300],
    divider: n[100],

    text: n[900],
    textMuted: n[500],
    textSubtle: n[400],
    /** Text on a solid brand fill (the brand fill is Charcoal in light mode and Soft White in dark mode). */
    onBrand: dark ? BRAND.charcoal : BRAND.pureWhite,
    /** Secondary text on a solid brand fill. */
    onBrandMuted: dark ? "#4A4A4A" : "#CFCFCF",
    /** A faint wash on a solid brand fill (icon backdrops). */
    onBrandWash: dark ? "rgba(21,21,21,0.12)" : "rgba(255,255,255,0.2)",
    /** Dark hero cards (job header, home greeting): a dark card with light text in both schemes. */
    heroBg: dark ? "#2A2A2A" : BRAND.charcoal,
    heroAccent: BRAND.pureWhite,
    heroMuted: "#B8B8B8",
    /** Text on a photo or a dark overlay: always light. */
    textOnDark: BRAND.pureWhite,
    textOnDarkMuted: "#CFCFCF",

    brand: dark ? BRAND.softWhite : BRAND.charcoal,
    brandSoft: dark ? "#D8D8D8" : "#2A2A2A",
    accent: dark ? BRAND.softWhite : BRAND.charcoal,
    accentSoft: n[100],
    accentText: n[900],

    success: g[dark ? 700 : 800],
    successSoft: g[100],
    successBorder: g[200],
    warning: a[800],
    warningSoft: a[100],
    warningBorder: a[200],
    danger: r[700],
    dangerSoft: r[50],
    dangerBorder: r[200],
    info: n[700],
    infoSoft: n[100],
    infoBorder: n[200],
    disabled: n[400],
  };
}

export type SemanticColors = ReturnType<typeof semanticColors>;

// --- contrast helpers (WCAG 2.x), used by the tests and available to anything that needs a readable pair ---

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Blend a translucent colour (rgba) over a solid one, for contrast checks of glass surfaces. */
export function overHex(rgba: string, backdropHex: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(rgba);
  if (!m) throw new Error("Not an rgb/rgba colour: " + rgba);
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  const back = hexToRgb(backdropHex);
  const mix = [Number(m[1]), Number(m[2]), Number(m[3])].map((c, i) => Math.round(c * alpha + back[i] * (1 - alpha)));
  return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** "#F6F6F6" -> "246 246 246": the form Tailwind's `rgb(var(--x) / <alpha-value>)` colours use. */
export function hexToChannels(hex: string): string {
  return hexToRgb(hex).join(" ");
}
