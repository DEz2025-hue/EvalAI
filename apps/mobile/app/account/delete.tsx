import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { apiFetch } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";
import { setActiveWorkspace } from "../../lib/workspace";
import { colors, space } from "../../lib/theme";
import { Banner, Button, Card, ErrorState, Field, Icon, ListRow, Loading, Screen, SectionHeader, Text } from "../../components/ui";

type Ws = { id: string; name: string; role: string; memberCount: number };
type Plan = { deleteWorkspaces: Ws[]; blockers: Ws[]; leaveWorkspaces: Ws[] };

const CONFIRM_WORD = "DELETE";

export default function DeleteAccount() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/account");
      const data = (await res.json().catch(() => ({}))) as Plan & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not check your account");
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove() {
    setDeleting(true);
    try {
      const res = await apiFetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: CONFIRM_WORD }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; blockers?: Ws[] };
      if (res.status === 409 && data.blockers) {
        setPlan((p) => (p ? { ...p, blockers: data.blockers! } : p));
        throw new Error(data.error ?? "Hand over ownership first.");
      }
      if (!res.ok) throw new Error(data.error ?? "Could not delete your account");
      // The account no longer exists on the server; clear what this phone still holds.
      await setActiveWorkspace(null).catch(() => undefined);
      await getSupabase()?.auth.signOut({ scope: "local" }).catch(() => undefined);
      Alert.alert("Account deleted", "Your account and personal workspaces have been permanently deleted.");
      router.replace("/auth/sign-in");
    } catch (e) {
      Alert.alert("Couldn't delete account", e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function confirmAndDelete() {
    Alert.alert("Delete your account?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete forever", style: "destructive", onPress: () => void remove() },
    ]);
  }

  const blocked = !!plan && plan.blockers.length > 0;
  const ready = !!plan && !blocked && typed.trim() === CONFIRM_WORD;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Delete account" }} />
      <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.md }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name="warning-outline" size={28} color={colors.danger} />
        </View>
        <Text variant="title">Delete your account</Text>
        <Text variant="caption" style={{ textAlign: "center", maxWidth: 320 }}>This permanently removes your sign-in. It can't be undone.</Text>
      </View>

      {!plan && !error ? <Loading label="Checking your workspaces…" variant="card" rows={3} /> : null}
      {error ? <ErrorState title="Couldn't check your account" message={error} onRetry={load} /> : null}

      {plan ? (
        <>
          {blocked ? (
            <Banner tone="danger" title="Hand over ownership first" message="You're the only owner of these shared workspaces. Make someone else an owner (on the web app's Team page), then come back." />
          ) : null}
          {plan.blockers.length ? (
            <Card padded={false}>
              {plan.blockers.map((w, i, a) => (
                <ListRow key={w.id} icon="lock-closed-outline" iconColor={colors.danger} title={w.name} subtitle={`${w.memberCount} members · you're the only owner`} last={i === a.length - 1} />
              ))}
            </Card>
          ) : null}

          {plan.deleteWorkspaces.length ? (
            <Card padded={false}>
              <View style={{ padding: space.lg, paddingBottom: space.sm }}>
                <SectionHeader title="Deleted with your account" subtitle="Only you are in these, so everything in them goes: jobs, photos, voice notes and reports." />
              </View>
              {plan.deleteWorkspaces.map((w, i, a) => (
                <ListRow key={w.id} icon="trash-outline" iconColor={colors.danger} title={w.name} last={i === a.length - 1} />
              ))}
            </Card>
          ) : null}

          {plan.leaveWorkspaces.length ? (
            <Card padded={false}>
              <View style={{ padding: space.lg, paddingBottom: space.sm }}>
                <SectionHeader title="You'll leave" subtitle="Your team keeps the work you did here; it will show as by a deleted user." />
              </View>
              {plan.leaveWorkspaces.map((w, i, a) => (
                <ListRow key={w.id} icon="exit-outline" title={w.name} subtitle={`${w.memberCount} members`} last={i === a.length - 1} />
              ))}
            </Card>
          ) : null}

          {!blocked ? (
            <Card style={{ gap: space.md }}>
              <Field label={`Type ${CONFIRM_WORD} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder={CONFIRM_WORD} />
              <Button title={deleting ? "Deleting…" : "Delete my account"} icon="trash-outline" variant="danger" onPress={confirmAndDelete} loading={deleting} disabled={!ready} />
            </Card>
          ) : null}
        </>
      ) : null}

      <Button title="Keep my account" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
