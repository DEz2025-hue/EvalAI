import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// SecureStore values are limited to ~2KB on some platforms and a Supabase session is larger,
// so the value is split into chunks. On web (no SecureStore) localStorage is used instead.
const CHUNK = 1800;

async function getRaw(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    }
    const count = Number((await getRaw(key + ".n")) ?? 0);
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await getRaw(key + "." + i);
      if (part === null) return null; // incomplete write — treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try { globalThis.localStorage?.setItem(key, value); } catch { /* storage unavailable */ }
      return;
    }
    await secureStorage.removeItem(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK) chunks.push(value.slice(i, i + CHUNK));
    for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(key + "." + i, chunks[i]);
    await SecureStore.setItemAsync(key + ".n", String(chunks.length));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try { globalThis.localStorage?.removeItem(key); } catch { /* storage unavailable */ }
      return;
    }
    const count = Number((await getRaw(key + ".n")) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(key + "." + i);
    await SecureStore.deleteItemAsync(key + ".n");
  },
};
