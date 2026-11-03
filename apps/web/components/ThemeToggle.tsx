"use client";

import type { JSX } from "react";
import { THEME_LABEL, THEME_ORDER, useThemeMode, type ThemeMode } from "../lib/themeMode";

const ICON_PATHS: Record<ThemeMode, JSX.Element> = {
  // a screen: follow the device
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
};

function ThemeIcon({ mode, className = "h-[18px] w-[18px]" }: { mode: ThemeMode; className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICON_PATHS[mode]}
    </svg>
  );
}

/** The header button: each press moves to the next choice (Device, Light, Dark). */
export default function ThemeToggle(): JSX.Element {
  const [mode, setMode] = useThemeMode();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
  const label = `Theme: ${THEME_LABEL[mode]}. Switch to ${THEME_LABEL[next]}.`;
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/60 text-slate-600 backdrop-blur transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
    >
      <ThemeIcon mode={mode} />
    </button>
  );
}

/** The Settings control: all three choices side by side. */
export function ThemeSwitch(): JSX.Element {
  const [mode, setMode] = useThemeMode();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full border border-slate-200 bg-white/60 p-1">
      {THEME_ORDER.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${mode === m ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
        >
          <ThemeIcon mode={m} className="h-4 w-4" />
          {THEME_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
