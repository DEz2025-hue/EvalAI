import "react-native-url-polyfill/auto";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useColorScheme, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import type { SchemeName } from "@eval-ai/shared";
import { applyScheme, colors, radius, space } from "../lib/theme";
import { loadThemePreference, useThemePreference } from "../lib/themePreference";
import { Skeleton, SkeletonGroup, SkeletonList, SkeletonStats } from "../components/skeleton";

// Expo inlines EXPO_PUBLIC_* only when the dev server starts — say so loudly instead of failing quietly later.
if (__DEV__) {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_APP_URL: process.env.EXPO_PUBLIC_APP_URL,
  };
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.warn(`[config] Missing ${missing.join(", ")}. Set them in apps/mobile/.env.local and restart Expo with: npx expo start --clear`);
  else console.log(`[config] API ${env.EXPO_PUBLIC_APP_URL}`);
}

/** Sends signed-out people to sign-in (and signed-in people away from it). Without a configured backend the app stays signed out. */
function AuthGate() {
  const { loading, session, configured } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || !configured) return;
    const inAuth = segments[0] === "auth";
    // Verifying a reset code signs the person in before the new password is saved; the reset screen navigates itself.
    const resetting = inAuth && (segments as string[])[1] === "recovery";
    if (!session && !inAuth) router.replace("/auth/sign-in" as never);
    else if (session && inAuth && !resetting) router.replace("/(tabs)" as never);
  }, [loading, configured, session, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, paddingTop: space.xxl * 2 }}>
        <SkeletonGroup label="Loading" style={{ gap: space.md }}>
          <Skeleton height={96} rounded={radius.lg} />
          <SkeletonStats count={2} />
          <SkeletonList rows={3} />
        </SkeletonGroup>
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="workspace" />
      <Stack.Screen name="assessments" />
      <Stack.Screen name="account" />
    </Stack>
  );
}

/**
 * Follows the device's light or dark setting. The colour objects in lib/theme are rewritten in place for the new scheme, and the
 * screens below are remounted (the key) so they are drawn again with the new colours. A theme switch is rare, so losing a screen's
 * transient state at that moment is accepted.
 */
function ThemeRoot({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference] = useThemePreference();
  const [ready, setReady] = useState(false);
  // Read the saved choice before drawing anything, so a person who picked Dark does not see a flash of Light.
  useEffect(() => {
    void loadThemePreference().finally(() => setReady(true));
  }, []);
  const scheme: SchemeName = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
  applyScheme(scheme);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <Fragment key={scheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {children}
    </Fragment>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ThemeRoot>
          <AuthGate />
        </ThemeRoot>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
