import "react-native-url-polyfill/auto";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";

/** Sends signed-out people to sign-in (and signed-in people away from it). Without Supabase env the app stays in local demo mode. */
function AuthGate() {
  const { loading, session, configured } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || !configured) return;
    const inAuth = segments[0] === "auth";
    if (!session && !inAuth) router.replace("/auth/sign-in" as never);
    else if (session && inAuth) router.replace("/(tabs)" as never);
  }, [loading, configured, session, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
        <ActivityIndicator />
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
