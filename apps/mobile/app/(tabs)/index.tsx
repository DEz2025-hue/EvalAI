import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { firstName, scenarioFor, scenarioLabel } from "@eval-ai/shared";
import { loadWorkspaces } from "../../lib/myWorkspaces";
import { capitalize, siteNameOf, timeAgo } from "../../lib/format";
import { systemIcon, systemLabel } from "../../lib/packs";
import { colors, radius, space } from "../../lib/theme";
import type { AssessmentRow } from "../../lib/types";
import { Banner, Button, Card, EmptyState, ErrorState, Icon, ListRow, Loading, Screen, SectionHeader, StatusBadge, Text, type IconName } from "../../components/ui";

type HomeState =
  | { kind: "loading" }
  | { kind: "no-env" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; rows: AssessmentRow[] };

function QuickAction({ icon, title, subtitle, onPress, primary }: { icon: IconName; title: string; subtitle: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        padding: space.md,
        gap: space.sm,
        borderRadius: radius.md,
        backgroundColor: primary ? colors.accent : colors.surface,
        borderWidth: 1,
        borderColor: primary ? colors.accent : colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: primary ? "rgba(255,255,255,0.2)" : colors.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={primary ? colors.textOnDark : colors.text} />
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="bodyStrong" color={primary ? colors.textOnDark : colors.text}>{title}</Text>
        <Text variant="caption" color={primary ? colors.accentSoft : colors.textMuted}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [state, setState] = useState<HomeState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setState({ kind: "no-env" });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setState({ kind: "no-env" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const { active, name } = await loadWorkspaces();
      setUserLabel(firstName(name) || null);
      setWorkspaceName(active?.name ?? null);
      if (!active) {
        setState({ kind: "empty" });
        return;
      }

      const { data, error } = await supabase
        .from("assessments")
        .select("id, workspace_id, site_id, mode, pack, status, context, created_at, updated_at, sites(name, address)")
        .eq("workspace_id", active.id)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AssessmentRow[];
      if (rows.length === 0) setState({ kind: "empty" });
      else setState({ kind: "ready", rows });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const startJob = (mode: "assessment" | "inspection") => router.push({ pathname: "/(tabs)/create", params: { mode } });

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={{ backgroundColor: colors.brand, borderRadius: radius.lg, padding: space.lg, gap: space.xs }}>
        <Text variant="overline" color={colors.textSubtle}>{workspaceName ?? "Workspace"}</Text>
        <Text variant="display" color={colors.textOnDark}>
          {greeting}
          {userLabel ? `, ${userLabel}` : ""}
        </Text>
        <Text variant="caption" color={colors.textOnDarkMuted}>
          {state.kind === "ready" ? `${state.rows.length} recent job${state.rows.length === 1 ? "" : "s"} · pull down to refresh` : "Here's what's happening today"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: space.md }}>
        <QuickAction primary icon="clipboard" title="New assessment" subtitle="Evaluate a site" onPress={() => startJob("assessment")} />
        <QuickAction icon="checkmark-done" title="New inspection" subtitle="Check an install" onPress={() => startJob("inspection")} />
      </View>

      <Card padded={false}>
        <View style={{ padding: space.lg, paddingBottom: space.md }}>
          <SectionHeader
            title="Recent jobs"
            action={
              <Link href="/(tabs)/jobs" asChild>
                <Button title="See all" variant="ghost" size="sm" />
              </Link>
            }
          />
        </View>

        {state.kind === "loading" ? <Loading label="Loading jobs…" /> : null}

        {state.kind === "no-env" ? (
          <EmptyState icon="log-in-outline" title="Sign in to see your jobs" message="You can still start a draft from New job." action={<Button title="Start a draft" icon="add" variant="accent" size="sm" onPress={() => router.push("/(tabs)/create")} />} />
        ) : null}

        {state.kind === "error" ? (
          <View style={{ padding: space.lg, paddingTop: 0 }}>
            <ErrorState title="Couldn't load jobs" message={state.message} onRetry={fetchData} />
          </View>
        ) : null}

        {state.kind === "empty" ? (
          <EmptyState icon="briefcase-outline" title="No jobs yet" message="Create an assessment or inspection to get started." action={<Button title="New job" icon="add" variant="accent" size="sm" onPress={() => router.push("/(tabs)/create")} />} />
        ) : null}

        {state.kind === "ready"
          ? state.rows.slice(0, 5).map((row, i, arr) => (
              <ListRow
                key={row.id}
                icon={systemIcon(row.pack)}
                title={siteNameOf(row)}
                subtitle={`${systemLabel(row.pack)} · ${capitalize(row.mode)}${scenarioFor(row.mode, row.context?.scenario) ? " · " + scenarioLabel(scenarioFor(row.mode, row.context?.scenario)) : ""}`}
                meta={`Updated ${timeAgo(row.updated_at)}`}
                right={<StatusBadge status={row.status} />}
                onPress={() => router.push(`/assessments/${row.id}`)}
                last={i === arr.length - 1}
              />
            ))
          : null}
      </Card>

      <Banner tone="neutral" title="Live session — Beta" message="Open a job and tap Live session to get AI suggestions from the camera every few seconds." />
    </Screen>
  );
}
