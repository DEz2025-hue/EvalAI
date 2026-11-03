import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { scenarioFor, scenarioLabel, type PackId } from "@eval-ai/shared";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { loadWorkspaces } from "../../lib/myWorkspaces";
import { capitalize, siteNameOf, timeAgo } from "../../lib/format";
import { isSystem, systemIcon, systemLabel, systemOptions } from "../../lib/packs";
import { colors, space } from "../../lib/theme";
import type { AssessmentRow } from "../../lib/types";
import { Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, SearchField, Select, StatusBadge, Text } from "../../components/ui";

type ModeFilter = "all" | "assessment" | "inspection";
type PackFilter = "all" | PackId;
type StatusFilter = "all" | "draft" | "in_progress" | "review" | "finalized";

type ListState =
  | { kind: "loading" }
  | { kind: "no-env" }
  | { kind: "error"; message: string }
  | { kind: "empty"; reason: string }
  | { kind: "ready"; rows: AssessmentRow[] };

export default function JobsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [pack, setPack] = useState<PackFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
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
      const { active } = await loadWorkspaces();
      if (!active) {
        setState({ kind: "empty", reason: "Create an assessment or inspection to get started." });
        return;
      }
      let query = supabase
        .from("assessments")
        .select("id, workspace_id, site_id, mode, pack, status, context, created_at, updated_at, sites(name, address)")
        .eq("workspace_id", active.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (mode !== "all") query = query.eq("mode", mode);
      if (pack !== "all") query = query.eq("pack", pack);
      if (status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AssessmentRow[];
      if (rows.length === 0) {
        const reason =
          mode !== "all" || pack !== "all" || status !== "all"
            ? "Try a different combination or clear the filters."
            : "Create an assessment or inspection to get started.";
        setState({ kind: "empty", reason });
      } else {
        setState({ kind: "ready", rows });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ kind: "error", message: msg });
    }
  }, [mode, pack, status]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  }

  const filteredBySearch = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter((r) => {
      const siteName = siteNameOf(r).toLowerCase();
      const id = r.id.toLowerCase();
      return siteName.includes(q) || id.includes(q) || systemLabel(r.pack).toLowerCase().includes(q) || r.mode.includes(q) || r.status.includes(q);
    });
  }, [state, search]);

  function openJob(row: AssessmentRow) {
    router.push(`/assessments/${row.id}` as never);
  }

  const filtersActive = mode !== "all" || pack !== "all" || status !== "all";
  const clearAll = () => {
    setMode("all");
    setPack("all");
    setStatus("all");
    setSearch("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: space.md, gap: space.sm }}>
        <View style={{ paddingHorizontal: space.md }}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search site, system or status" />
        </View>
        <View style={{ paddingHorizontal: space.md }}>
          <Select
            title="Filter by system"
            value={pack}
            options={[{ value: "all", label: "All systems", icon: "apps-outline" }, ...systemOptions()]}
            onChange={(v) => setPack(isSystem(v) ? v : "all")}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.md, gap: 6, alignItems: "center" }}>
          {(["all", "assessment", "inspection"] as ModeFilter[]).map((v) => (
            <Chip key={v} label={v === "all" ? "Assessments & inspections" : capitalize(v) + "s"} active={mode === v} onPress={() => setMode(v)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.md, gap: 6, alignItems: "center" }}>
          {(["all", "draft", "in_progress", "review", "finalized"] as StatusFilter[]).map((v) => (
            <Chip key={v} label={v === "all" ? "Any status" : capitalize(v.replace("_", " "))} active={status === v} onPress={() => setStatus(v)} />
          ))}
          {filtersActive || search ? <Button title="Clear" variant="ghost" size="sm" icon="close" onPress={clearAll} /> : null}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.sm, paddingBottom: space.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        {state.kind === "loading" ? <Loading label="Loading jobs…" /> : null}

        {state.kind === "no-env" ? (
          <EmptyState icon="log-in-outline" title="Sign in to see jobs" message="Your workspace jobs appear here once you're signed in." action={<Button title="Start a draft" icon="add" variant="accent" size="sm" onPress={() => router.push("/(tabs)/create")} />} />
        ) : null}

        {state.kind === "error" ? <ErrorState title="Couldn't load jobs" message={state.message} onRetry={fetchJobs} /> : null}

        {state.kind === "empty" ? (
          <EmptyState
            icon={filtersActive ? "funnel-outline" : "briefcase-outline"}
            title={filtersActive ? "No matching jobs" : "No jobs yet"}
            message={state.reason}
            action={filtersActive ? <Button title="Clear filters" variant="secondary" size="sm" onPress={clearAll} /> : <Button title="New job" icon="add" variant="accent" size="sm" onPress={() => router.push("/(tabs)/create")} />}
          />
        ) : null}

        {state.kind === "ready" && filteredBySearch.length === 0 ? (
          <EmptyState icon="search-outline" title={`No results for "${search}"`} message="Try a different search or clear the filters." />
        ) : null}

        {state.kind === "ready"
          ? filteredBySearch.map((row) => (
              <Card key={row.id} padded={false}>
                <View style={{ padding: space.lg, gap: space.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="heading" numberOfLines={1}>{siteNameOf(row)}</Text>
                      {row.sites?.address ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Icon name="location-outline" size={13} color={colors.textMuted} />
                          <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{row.sites.address}</Text>
                        </View>
                      ) : null}
                    </View>
                    <StatusBadge status={row.status} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name={systemIcon(row.pack)} size={14} color={colors.textMuted} />
                    <Text variant="caption">{systemLabel(row.pack)} · {capitalize(row.mode)}{scenarioFor(row.mode, row.context?.scenario) ? " · " + scenarioLabel(scenarioFor(row.mode, row.context?.scenario)) : ""} · {timeAgo(row.updated_at)}</Text>
                  </View>
                  <Button
                    title={row.status === "draft" ? "Resume draft" : "Open job"}
                    variant={row.status === "draft" ? "accent" : "secondary"}
                    size="sm"
                    icon={row.status === "draft" ? "play" : "open-outline"}
                    onPress={() => openJob(row)}
                    style={{ alignSelf: "flex-start", marginTop: 2 }}
                  />
                </View>
              </Card>
            ))
          : null}

        {state.kind === "ready" && filteredBySearch.length > 0 ? (
          <Text variant="caption" color={colors.textSubtle} style={{ textAlign: "center", marginTop: space.xs }}>
            Showing {filteredBySearch.length} of {state.rows.length} jobs
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
