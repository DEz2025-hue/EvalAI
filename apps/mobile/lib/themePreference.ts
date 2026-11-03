import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { secureStorage } from "./secureStorage";

/** The person's choice: follow the device, or always light, or always dark. Remembered on this device. */
export type ThemePreference = "system" | "light" | "dark";

const KEY = "eval-ai.theme";
let preference: ThemePreference = "system";
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/** Tell the system too, so native pieces (the keyboard, alerts, native glass) use the same scheme. Not available everywhere. */
function syncSystem(p: ThemePreference) {
  try {
    Appearance.setColorScheme(p === "system" ? "unspecified" : p);
  } catch {
    /* not supported on this platform */
  }
}

/** Read the saved choice. Call once at startup, before the first screen is drawn. */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const v = await secureStorage.getItem(KEY);
    if (v === "light" || v === "dark") {
      preference = v;
      syncSystem(v);
      notify();
    }
  } catch {
    /* an unreadable setting means "follow the device" */
  }
  return preference;
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  syncSystem(next);
  void (next === "system" ? secureStorage.removeItem(KEY) : secureStorage.setItem(KEY, next)).catch(() => undefined);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const value = useSyncExternalStore(subscribe, getThemePreference, getThemePreference);
  return [value, setThemePreference];
}
