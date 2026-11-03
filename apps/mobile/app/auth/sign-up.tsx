import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { KeyboardScroll } from "../../components/keyboard";
import { Link, useRouter } from "expo-router";
import { nameFromEmail } from "@eval-ai/shared";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { colors, space } from "../../lib/theme";
import { Banner, Button, Card, Field, Icon, Text } from "../../components/ui";
import { BrandLogo } from "../../components/BrandLogo";

const MIN_PASSWORD = 6;

/**
 * Supabase confirms the email before redirecting, so the link only needs to land somewhere sensible.
 * The mobile client uses the implicit flow (no ?code), so it points at the web sign-in page rather than /auth/callback.
 */
function confirmRedirect(): string | undefined {
  const base = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return base ? base + "/auth/sign-in" : undefined;
}

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!hasSupabaseEnv()) {
      Alert.alert("Sign-up unavailable", "This app isn't connected to your account service yet. Please contact your administrator.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase()!;
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: confirmRedirect(), data: { full_name: name.trim() } } });
      if (error) throw new Error(error.message);
      // With email confirmation off, Supabase returns a session straight away and the auth gate moves on.
      if (data.session) router.replace("/(tabs)");
      else setSentTo(email.trim());
    } catch (e) {
      Alert.alert("Couldn't create account", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const eye = (
    <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} style={{ paddingHorizontal: space.md }} accessibilityLabel={show ? "Hide password" : "Show password"}>
      <Icon name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <KeyboardScroll style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1, padding: space.lg, justifyContent: "center", gap: space.xl }}>
        <View style={{ alignItems: "center", gap: space.sm }}>
          <BrandLogo height={56} />
          <Text variant="display">Create account</Text>
          <Text variant="caption">Set up secure access to your workspace.</Text>
        </View>

        {sentTo ? (
          <Card style={{ gap: space.lg }}>
            <Banner tone="success" title="Check your email" message={`We sent a confirmation link to ${sentTo}. Open it, then come back here and sign in.`} />
            <Link href="/auth/sign-in" asChild>
              <Button title="Go to sign in" icon="log-in-outline" size="lg" />
            </Link>
          </Card>
        ) : (
          <Card style={{ gap: space.lg }}>
            <Field label="Email" value={email} onChangeText={(v) => { setEmail(v); if (!nameEdited) setName(nameFromEmail(v)); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" error={errors.email} />
            <Field label="Your name" value={name} onChangeText={(v) => { setName(v); setNameEdited(true); }} autoCapitalize="words" textContentType="name" autoComplete="name" placeholder="First and last name" hint={!nameEdited && name ? "Filled in from your email — change it if it's not right." : undefined} error={errors.name} />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} textContentType="newPassword" autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} error={errors.password} right={eye} />
            <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} textContentType="newPassword" autoComplete="new-password" placeholder="Type it again" error={errors.confirm} onSubmitEditing={submit} returnKeyType="go" />
            <Button title={loading ? "Creating account…" : "Create account"} onPress={submit} loading={loading} size="lg" />
          </Card>
        )}

        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 }}>
          <Text variant="caption">Already have an account?</Text>
          <Link href="/auth/sign-in" asChild>
            <Button title="Sign in" variant="ghost" size="sm" />
          </Link>
        </View>
    </KeyboardScroll>
  );
}
