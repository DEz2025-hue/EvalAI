import { useCallback, useState } from "react";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { hasSupabaseEnv } from "../../lib/supabase";
import { setActiveWorkspace } from "../../lib/workspace";
import { resetRole } from "../../lib/role";
import { loadWorkspaces, type MyWorkspace } from "../../lib/myWorkspaces";
import { capitalize } from "../../lib/format";
import { colors } from "../../lib/theme";
import { Card, EmptyState, ErrorState, Icon, ListRow, Loading, Screen, Text } from "../../components/ui";

type State = { kind: "loading" } | { kind: "no-env" } | { kind: "error"; message: string } | { kind: "ready"; rows: MyWorkspace[]; activeId: string | null };

export default function WorkspaceSelect() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  const fetchWS = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setState({ kind: "no-env" });
      return;
    }
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const { list, active } = await loadWorkspaces();
      setState({ kind: "ready", rows: list, activeId: active?.id ?? null });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchWS(); }, [fetchWS]));

  async function choose(id: string) {
    await setActiveWorkspace(id);
    resetRole();
    router.replace("/(tabs)");
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "Workspaces" }} />
      <Text variant="caption">You only see workspaces you're a member of. Switching refreshes your jobs and reports.</Text>

      {state.kind === "loading" ? <Loading label="Loading workspaces…" /> : null}
      {state.kind === "no-env" ? <EmptyState icon="log-in-outline" title="Sign in to see your workspaces" /> : null}
      {state.kind === "error" ? <ErrorState title="Couldn't load workspaces" message={state.message} onRetry={fetchWS} /> : null}

      {state.kind === "ready" ? (
        state.rows.length === 0 ? (
          <EmptyState icon="people-outline" title="No workspaces yet" message="Accept an invitation, or ask your administrator to add you to a workspace." />
        ) : (
          <Card padded={false}>
            {state.rows.map((r, i, arr) => {
              const current = r.id === state.activeId;
              return (
                <ListRow
                  key={r.id}
                  icon="business-outline"
                  title={r.name}
                  subtitle={capitalize(r.role)}
                  right={current ? <Icon name="checkmark-circle" size={20} color={colors.accent} /> : undefined}
                  chevron={!current}
                  onPress={() => void choose(r.id)}
                  last={i === arr.length - 1}
                />
              );
            })}
          </Card>
        )
      ) : null}
    </Screen>
  );
}
