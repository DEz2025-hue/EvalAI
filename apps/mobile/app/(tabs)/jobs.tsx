import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import type { AssessmentRow } from "../../lib/types";

type ModeFilter = "all" | "assessment" | "inspection";
type PackFilter = "all" | "solar" | "cctv";
type StatusFilter = "all" | "draft" | "in_progress" | "review" | "finalized";

type ListState =
  | { kind: "loading" }
  | { kind: "no-env" }
  | { kind: "error"; message: string }
  | { kind: "empty"; reason: string }
  | { kind: "ready"; rows: AssessmentRow[] };

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: active ? "#0f172a" : "#fff",
        borderWidth: 1,
        borderColor: active ? "#0f172a" : "#e2e8f0",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#fff" : "#475569" }}>{label}</Text>
    </Pressable>
  );
}

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
      let query = supabase
        .from("assessments")
        .select("id, workspace_id, site_id, mode, pack, status, context, created_at, updated_at, sites(name, address)")
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
            ? "No jobs match these filters. Try clearing filters."
            : "No jobs yet — create an assessment or inspection to begin.";
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
      const siteName = (r.sites?.name ?? (r.context as { siteName?: string })?.siteName ?? "").toLowerCase();
      const id = r.id.toLowerCase();
      return siteName.includes(q) || id.includes(q) || r.pack.includes(q) || r.mode.includes(q) || r.status.includes(q);
    });
  }, [state, search]);

  function openJob(row: AssessmentRow) {
    router.push(`/assessments/${row.id}` as never);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      {/* Search + filters */}
      <View style={{ backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", padding: 12, gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#f1f5f9",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: "#64748b" }}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by site, ID, pack, status"
            placeholderTextColor="#94a3b8"
            style={{ flex: 1, fontSize: 13, color: "#0f172a" }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} style={{ paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: "#64748b", fontWeight: "600" }}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b", width: 44 }}>MODE</Text>
            {(["all", "assessment", "inspection"] as ModeFilter[]).map((v) => (
              <Chip key={v} label={v === "all" ? "All" : v} active={mode === v} onPress={() => setMode(v)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b", width: 44 }}>PACK</Text>
            {(["all", "solar", "cctv"] as PackFilter[]).map((v) => (
              <Chip key={v} label={v === "all" ? "All" : v.toUpperCase()} active={pack === v} onPress={() => setPack(v)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b", width: 44 }}>STATUS</Text>
            {(["all", "draft", "in_progress", "review", "finalized"] as StatusFilter[]).map((v) => (
              <Chip key={v} label={v === "all" ? "All" : v} active={status === v} onPress={() => setStatus(v)} />
            ))}
          </View>
        </View>

        {(mode !== "all" || pack !== "all" || status !== "all" || search) ? (
          <Pressable
            onPress={() => {
              setMode("all");
              setPack("all");
              setStatus("all");
              setSearch("");
            }}
            style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f1f5f9" }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#0ea5e9" }}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {/* List states */}
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {state.kind === "loading" ? (
          <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ fontSize: 12, color: "#64748b" }}>Loading jobs…</Text>
          </View>
        ) : null}

        {state.kind === "no-env" ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 20, alignItems: "center" }}>
            <Text style={{ fontWeight: "700", color: "#0f172a" }}>Connect Supabase to see jobs</Text>
            <Text style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 6 }}>
              You will see your workspace jobs once you are signed in.
            </Text>
            <Pressable onPress={() => router.push("/(tabs)/create")} style={{ marginTop: 14, backgroundColor: "#0ea5e9", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Create job</Text>
            </Pressable>
          </View>
        ) : null}

        {state.kind === "error" ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#fecaca", borderRadius: 12, padding: 16 }}>
            <Text style={{ color: "#dc2626", fontWeight: "700", fontSize: 13 }}>Couldn&apos;t load jobs</Text>
            <Text style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{state.message}</Text>
            <Pressable onPress={fetchJobs} style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {state.kind === "empty" ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>{state.reason}</Text>
            <Pressable onPress={() => router.push("/(tabs)/create")} style={{ marginTop: 12, backgroundColor: "#0ea5e9", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>New job</Text>
            </Pressable>
          </View>
        ) : null}

        {state.kind === "ready" && filteredBySearch.length === 0 ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>No jobs match &quot;{search}&quot;. Try a different search or clear filters.</Text>
          </View>
        ) : null}

        {state.kind === "ready"
          ? filteredBySearch.map((row) => {
              const siteName = row.sites?.name ?? ((row.context as { siteName?: string })?.siteName as string) ?? "Untitled site";
              const isDraft = row.status === "draft";
              return (
                <Pressable
                  key={row.id}
                  onPress={() => openJob(row)}
                  style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, gap: 8 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontWeight: "700", color: "#0f172a", fontSize: 14 }} numberOfLines={1}>
                        {siteName}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#64748b" }}>
                        {row.pack.toUpperCase()} · {row.mode} · {row.status.replace("_", " ")}
                      </Text>
                      {row.sites?.address ? (
                        <Text style={{ fontSize: 11, color: "#94a3b8" }} numberOfLines={1}>
                          {row.sites.address}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: row.status === "finalized" ? "#dcfce7" : isDraft ? "#fef3c7" : row.status === "review" ? "#e0e7ff" : "#e0f2fe",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: row.status === "finalized" ? "#166534" : isDraft ? "#92400e" : row.status === "review" ? "#3730a3" : "#0369a1",
                        }}
                      >
                        {row.status}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: "#94a3b8" }}>Updated {timeAgo(row.updated_at)} · {row.id.slice(0, 8)}</Text>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <Pressable
                        onPress={() => openJob(row)}
                        style={{ backgroundColor: isDraft ? "#0ea5e9" : "#fff", borderWidth: isDraft ? 0 : 1, borderColor: "#e2e8f0", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                      >
                        <Text style={{ color: isDraft ? "#fff" : "#0f172a", fontWeight: "700", fontSize: 11 }}>{isDraft ? "Resume draft" : "Open"}</Text>
                      </Pressable>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: "#0ea5e9" }}>→</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          : null}

        {state.kind === "ready" ? (
          <Text style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
            Showing {filteredBySearch.length} of {state.rows.length} jobs · pull to refresh
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
