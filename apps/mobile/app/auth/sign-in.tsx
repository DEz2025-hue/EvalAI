import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { KeyboardScroll } from "../../components/keyboard";
import { Link, useRouter } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { colors, radius, space } from "../../lib/theme";
import { Button, Card, Field, Icon, Text } from "../../components/ui";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter your email and password.");
      return;
    }
    if (!hasSupabaseEnv()) {
      Alert.alert("Sign-in unavailable", "This app isn't connected to your account service yet. Please contact your administrator.");
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
    <KeyboardScroll style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1, padding: space.lg, justifyContent: "center", gap: space.xl }}>
        <View style={{ alignItems: "center", gap: space.sm }}>
          <View style={{ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shield-checkmark" size={28} color={colors.accent} />
          </View>
          <Text variant="display">EvalAI</Text>
          <Text variant="caption">Site assessments and inspections</Text>
        </View>

        <Card style={{ gap: space.lg }}>
          <Text variant="title">Sign in</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            textContentType="password"
            autoComplete="password"
            placeholder="Your password"
            onSubmitEditing={submit}
            returnKeyType="go"
            right={
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} style={{ paddingHorizontal: space.md }} accessibilityLabel={show ? "Hide password" : "Show password"}>
                <Icon name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </Pressable>
            }
          />
          <Button title={loading ? "Signing in…" : "Sign in"} onPress={submit} loading={loading} size="lg" />
          <Link href="/auth/recovery" asChild>
            <Button title="Forgot password?" variant="ghost" size="sm" />
          </Link>
        </Card>

        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 }}>
          <Text variant="caption">New here?</Text>
          <Link href="/auth/sign-up" asChild>
            <Button title="Create an account" variant="ghost" size="sm" />
          </Link>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icon name="lock-closed-outline" size={13} color={colors.textSubtle} />
          <Text variant="caption" color={colors.textSubtle}>Your session is stored securely on this device.</Text>
        </View>
    </KeyboardScroll>
  );
}
