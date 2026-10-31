import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { KeyboardScroll } from "../../components/keyboard";
import { Link, useRouter } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { colors, space } from "../../lib/theme";
import { Banner, Button, Card, Field, Icon, Text } from "../../components/ui";

const MIN_PASSWORD = 6;

/**
 * Password reset entirely in the app: Supabase emails a one-time code, the person types it here with a new password.
 * (Email links can't complete a reset started on the phone — the web callback expects a PKCE code this client never issues.)
 * Requires the Supabase "Reset password" email template to include {{ .Token }}.
 */
export default function Recovery() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});

  async function sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrors({ email: "Enter a valid email address." });
      return;
    }
    setErrors({});
    if (!hasSupabaseEnv()) {
      Alert.alert("Not available", "Password reset isn't set up yet. Please contact your administrator.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await getSupabase()!.auth.resetPasswordForEmail(email.trim());
      if (error) throw new Error(error.message);
      setStep("code");
    } catch (e) {
      Alert.alert("Couldn't send code", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    const next: typeof errors = {};
    if (!/^\d{6,10}$/.test(code.trim())) next.code = "Enter the code from the email.";
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const supabase = getSupabase()!;
      const { error: otpErr } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
      if (otpErr) throw new Error(otpErr.message);
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw new Error(updErr.message);
      Alert.alert("Password updated", "You're signed in with your new password.");
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Couldn't reset password", e instanceof Error ? e.message : String(e));
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
    <KeyboardScroll style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1, padding: space.lg, justifyContent: "center", gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="display">Reset password</Text>
          <Text variant="caption">
            {step === "email" ? "Enter your email and we'll send you a reset code." : `We sent a code to ${email.trim()}. Enter it below with your new password.`}
          </Text>
        </View>

        {step === "email" ? (
          <Card style={{ gap: space.lg }}>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" error={errors.email} onSubmitEditing={sendCode} returnKeyType="send" />
            <Button title={loading ? "Sending…" : "Send reset code"} onPress={sendCode} loading={loading} size="lg" />
          </Card>
        ) : (
          <Card style={{ gap: space.lg }}>
            <Field label="Reset code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={10} placeholder="123456" error={errors.code} />
            <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry={!show} textContentType="newPassword" autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} error={errors.password} right={eye} />
            <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} textContentType="newPassword" autoComplete="new-password" placeholder="Type it again" error={errors.confirm} onSubmitEditing={resetPassword} returnKeyType="go" />
            <Button title={loading ? "Updating…" : "Set new password"} onPress={resetPassword} loading={loading} size="lg" />
            <Banner tone="neutral" message="Codes expire after a while. If yours doesn't work, send a new one." />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button title="Send new code" icon="refresh" variant="secondary" size="sm" onPress={sendCode} disabled={loading} style={{ flex: 1 }} />
              <Button title="Change email" variant="ghost" size="sm" onPress={() => { setStep("email"); setCode(""); setErrors({}); }} style={{ flex: 1 }} />
            </View>
          </Card>
        )}

        <Link href="/auth/sign-in" asChild>
          <Button title="Back to sign in" variant="ghost" size="sm" icon="arrow-back" />
        </Link>
    </KeyboardScroll>
  );
}
