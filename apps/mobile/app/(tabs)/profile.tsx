import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { Link, useRouter, useFocusEffect } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";

export default function ProfileScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setEmail(null);
      return;
    }
    try {
      const supabase = getSupabase()!;
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      const { data: memberships } = await supabase.from("workspace_memberships").select("workspace_id, workspaces(name)").limit(1);
      const name = (memberships as unknown as Array<{ workspaces: { name: string } | null }> | null)?.[0]?.workspaces?.name ?? null;
      setWorkspaceName(name);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function signOut() {
    Alert.alert("Sign out?", "You will need your email and password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await getSupabase()?.auth.signOut();
          } catch {}
          setEmail(null);
          router.replace("/auth/sign-in");
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16, gap: 6 }}>
        <Text style={{ fontWeight: "700", color: "#0f172a" }}>Profile</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>{email ?? "Not signed in — your workspace data stays private."}</Text>
        {workspaceName ? <Text style={{ fontSize: 12, color: "#64748b" }}>Workspace: {workspaceName}</Text> : null}
      </View>

      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 8, gap: 2 }}>
        <Link href="/workspace/select" asChild>
          <Pressable style={{ paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>Switch workspace →</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/jobs" asChild>
          <Pressable style={{ paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0f172a" }}>My jobs →</Text>
          </Pressable>
        </Link>
        {email ? (
          <Pressable onPress={signOut} disabled={signingOut} style={{ paddingVertical: 12, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            {signingOut ? <ActivityIndicator size="small" color="#dc2626" /> : null}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#dc2626" }}>{signingOut ? "Signing out…" : "Sign out"}</Text>
          </Pressable>
        ) : (
          <Link href="/auth/sign-in" asChild>
            <Pressable style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#0ea5e9" }}>Sign in →</Text>
            </Pressable>
          </Link>
        )}
      </View>

      <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 12, color: "#92400e" }}>Live Camera — manual frames only</Text>
        <Text style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>No continuous guidance and no in-app viewfinder on mobile yet. Open a job → Live camera for the capability status and the still-photo alternative.</Text>
        <Link href="/(tabs)/jobs" asChild>
          <Pressable style={{ marginTop: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400e" }}>Open a job →</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
