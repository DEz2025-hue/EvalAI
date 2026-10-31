import "react-native-url-polyfill/auto";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import { colors } from "../lib/theme";

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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <AuthGate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
