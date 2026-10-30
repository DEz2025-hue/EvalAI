import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter email and password.");
      return;
    }
    if (!hasSupabaseEnv()) {
      Alert.alert("No Supabase env", "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to sign in. Auth stays -enforced — anon key only, never service-role.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase()!;
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Sign in failed", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc", padding: 16, justifyContent: "center", gap: 16 }}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>EA</Text></View>
        <Text style={{ fontSize: 20, fontWeight: "800", color: "#0f172a" }}>EvalAI</Text>
        <Text style={{ fontSize: 12, color: "#64748b" }}>Solar · CCTV · Assessment · Inspection</Text>
      </View>

      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16, gap: 12 }}>
        <Text style={{ fontWeight: "700", color: "#0f172a" }}>Sign in</Text>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 14, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>Password</Text>
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, backgroundColor: "#fff" }}>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={!show} placeholder="••••••••" placeholderTextColor="#94a3b8" style={{ flex: 1, padding: 10, fontSize: 14, color: "#0f172a" }} />
            <Pressable onPress={() => setShow((v) => !v)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}><Text style={{ fontSize: 12, fontWeight: "600", color: "#0ea5e9" }}>{show ? "Hide" : "Show"}</Text></Pressable>
          </View>
        </View>

        <Pressable onPress={submit} disabled={loading} style={{ backgroundColor: loading ? "#94a3b8" : "#0f172a", paddingVertical: 12, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
          <Text style={{ color: "#fff", fontWeight: "700" }}>{loading ? "Signing in…" : "Sign in"}</Text>
        </Pressable>

        <Link href="/auth/recovery" asChild><Pressable style={{ alignItems: "center", paddingVertical: 6 }}><Text style={{ fontSize: 12, color: "#0ea5e9", fontWeight: "600" }}>Forgot password?</Text></Pressable></Link>
      </View>

      <Text style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>Uses Supabase Auth — never logs credentials. Rate-limited. Session stored securely.</Text>
    </View>
  );
}
