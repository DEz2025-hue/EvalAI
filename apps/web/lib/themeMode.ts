import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

/** The person's choice: follow the device, or always light, or always dark. Remembered in this browser. */
export type ThemeMode = "system" | "light" | "dark";

const listeners = new Set<() => void>();

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function applyMode(mode: ThemeMode): void {
  const el = document.documentElement;
  if (mode === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", mode);
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    if (mode === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* storage unavailable: the choice lasts until the page is closed */
  }
  applyMode(mode);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // another tab changed the choice
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      applyMode(readMode());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as ThemeMode);
  return [mode, setThemeMode];
}

export const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];
export const THEME_LABEL: Record<ThemeMode, string> = { system: "Device", light: "Light", dark: "Dark" };
