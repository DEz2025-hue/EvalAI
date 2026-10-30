import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";

/** The reset email opens the web app, which completes the password change (no deep-link handling needed on the phone). */
function webResetUrl(): string | undefined {
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return base ? base + "/auth/callback?next=/auth/reset" : undefined;
}

export default function Recovery() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!email.trim()) {
      Alert.alert("Enter email", "Email is required.");
      return;
    }
    if (!hasSupabaseEnv()) {
      Alert.alert("No Supabase env", "Recovery isn't configured yet. Please contact your administrator.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase()!;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: webResetUrl() });
      if (error) throw new Error(error.message);
      setSent(true);
      Alert.alert("Check your email", "If an account exists for that email, a recovery link has been sent. Open it in your browser to choose a new password, then sign in here.");
    } catch (e) {
      Alert.alert("Recovery failed", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc", padding: 16, justifyContent: "center", gap: 16 }}>
      <Text style={{ fontWeight: "800", fontSize: 18, color: "#0f172a" }}>Password recovery</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>We will send a recovery link if an account exists for that email.</Text>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16, gap: 12 }}>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 14, color: "#0f172a", backgroundColor: "#fff" }} />
        <Pressable onPress={submit} disabled={loading} style={{ backgroundColor: loading ? "#94a3b8" : "#0f172a", paddingVertical: 12, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
          <Text style={{ color: "#fff", fontWeight: "700" }}>{loading ? "Sending…" : "Send recovery link"}</Text>
        </Pressable>
        {sent ? <Text style={{ fontSize: 12, color: "#15803d" }}>If an account exists for that email, a recovery link has been sent. Open it in your browser to set a new password, then come back and sign in.</Text> : null}
        <Link href="/auth/sign-in" asChild><Pressable style={{ alignItems: "center", paddingVertical: 6 }}><Text style={{ fontSize: 12, color: "#0ea5e9", fontWeight: "600" }}>Back to sign in</Text></Pressable></Link>
      </View>
    </View>
  );
}
