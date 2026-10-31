import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { Link, useRouter, useFocusEffect } from "expo-router";
import { initials } from "@eval-ai/shared";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { loadWorkspaces } from "../../lib/myWorkspaces";
import { colors, space } from "../../lib/theme";
import { Button, Card, Field, IconButton, ListRow, Screen, Text } from "../../components/ui";

export default function ProfileScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setEmail(null);
      return;
    }
    try {
      const { active, email: signedInAs, name: shownName } = await loadWorkspaces();
      setEmail(signedInAs);
      setName(shownName);
      setWorkspaceName(active ? `${active.name} · ${active.role}` : null);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveName() {
    const next = draftName.trim();
    if (next.length < 2) {
      Alert.alert("Name too short", "Enter at least 2 characters.");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await getSupabase()!.auth.updateUser({ data: { full_name: next } });
      if (error) throw new Error(error.message);
      setName(next);
      setEditing(false);
    } catch (e) {
      Alert.alert("Couldn't save your name", e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  }

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
    <Screen>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
            <Text variant="title" color={colors.textOnDark}>{initials(name || email || "")}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={1}>{email ? name || email : "Not signed in"}</Text>
            {email ? <Text variant="caption" numberOfLines={1}>{email}</Text> : null}
            <Text variant="caption" numberOfLines={1}>{workspaceName ?? "No workspace selected"}</Text>
          </View>
          {email && !editing ? <IconButton icon="create-outline" label="Edit name" onPress={() => { setDraftName(name); setEditing(true); }} /> : null}
        </View>
        {editing ? (
          <View style={{ gap: space.sm }}>
            <Field label="Your name" value={draftName} onChangeText={setDraftName} autoCapitalize="words" textContentType="name" autoComplete="name" autoFocus onSubmitEditing={saveName} returnKeyType="done" />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button title="Cancel" variant="secondary" size="sm" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              <Button title={savingName ? "Saving…" : "Save"} size="sm" onPress={saveName} loading={savingName} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
      </Card>

      <Text variant="overline" style={{ marginTop: space.sm }}>Workspace</Text>
      <Card padded={false}>
        <Link href="/workspace/select" asChild>
          <ListRow icon="swap-horizontal-outline" title="Switch workspace" subtitle={workspaceName ?? undefined} />
        </Link>
        <Link href="/(tabs)/jobs" asChild>
          <ListRow icon="briefcase-outline" title="My jobs" last />
        </Link>
      </Card>

      <Text variant="overline" style={{ marginTop: space.sm }}>Account</Text>
      <Card padded={false}>
        {email ? (
          <>
            <ListRow icon="log-out-outline" title={signingOut ? "Signing out…" : "Sign out"} onPress={signOut} chevron={false} />
            <Link href={"/account/delete" as never} asChild>
              <ListRow icon="trash-outline" title="Delete account" destructive last />
            </Link>
          </>
        ) : (
          <Link href="/auth/sign-in" asChild>
            <ListRow icon="log-in-outline" title="Sign in" last />
          </Link>
        )}
      </Card>
    </Screen>
  );
}
