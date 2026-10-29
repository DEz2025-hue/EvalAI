import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { PACK_TEMPLATES } from "@eval-ai/shared";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import type { AssessmentRow } from "../../lib/types";

type HomeState =
  | { kind: "loading" }
  | { kind: "no-env" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
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
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes?.user?.email) setUserLabel(userRes.user.email);
      else setUserLabel(null);

      // workspace context: first membership → workspace name
      const { data: memberships } = await supabase
        .from("workspace_memberships")
        .select("workspace_id, workspaces(name)")
        .limit(1);
      const wsName = (memberships as unknown as Array<{ workspaces: { name: string } | null }>)?.[0]?.workspaces?.name ?? null;
      setWorkspaceName(wsName);

      const { data, error } = await supabase
        .from("assessments")
        .select("id, workspace_id, site_id, mode, pack, status, context, created_at, updated_at, sites(name, address)")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AssessmentRow[];
      if (rows.length === 0) setState({ kind: "empty" });
      else setState({ kind: "ready", rows });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ kind: "error", message: msg });
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

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Greeting + workspace context */}
      <View style={{ backgroundColor: "#0f172a", borderRadius: 16, padding: 16 }}>
        <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "600", letterSpacing: 0.6 }}>WORKSPACE</Text>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4 }}>
          {greeting}
          {userLabel ? `, ${userLabel.split("@")[0]}` : ""}
        </Text>
        <Text style={{ color: "#cbd5e1", fontSize: 13, marginTop: 4 }}>
          {workspaceName ? workspaceName : hasSupabaseEnv() ? "Your workspace — pull to refresh" : "Connect Supabase to see your workspace"}
        </Text>
        {!hasSupabaseEnv() ? (
          <View style={{ marginTop: 10, backgroundColor: "#1e293b", borderRadius: 8, padding: 10 }}>
            <Text style={{ color: "#f59e0b", fontSize: 12, fontWeight: "600" }}>No Supabase env</Text>
            <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
              Your data stays private to your workspace.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Primary actions */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => router.push({ pathname: "/(tabs)/create", params: { mode: "assessment", pack: "solar" } })}
          style={{ flex: 1, backgroundColor: "#0ea5e9", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>New Assessment</Text>
          <Text style={{ color: "#e0f2fe", fontSize: 11, marginTop: 2 }}>{PACK_TEMPLATES.solar.label} · assessment</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: "/(tabs)/create", params: { mode: "inspection", pack: "cctv" } })}
          style={{
            flex: 1,
            backgroundColor: "#fff",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#e2e8f0",
          }}
        >
          <Text style={{ color: "#0f172a", fontWeight: "700" }}>New Inspection</Text>
          <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{PACK_TEMPLATES.cctv.label} · inspection</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Link href="/(tabs)/jobs" asChild>
          <Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 12, alignItems: "center" }}>
            <Text style={{ fontWeight: "600", color: "#0f172a" }}>View Jobs</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/reports" asChild>
          <Pressable style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 12, alignItems: "center" }}>
            <Text style={{ fontWeight: "600", color: "#0f172a" }}>Reports</Text>
          </Pressable>
        </Link>
      </View>

      {/* Live camera placeholder — Coming Soon only */}
      <View
        style={{
          backgroundColor: "#fef3c7",
          borderWidth: 1,
          borderColor: "#fde68a",
          borderRadius: 12,
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 18 }}>◎</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", fontSize: 12, color: "#92400e" }}>Live Camera — Coming Soon</Text>
          <Text style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
            Use photo and voice capture instead — camera guidance isn't available in this release.
          </Text>
        </View>
      </View>

      {/* Assigned / recent jobs */}
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontWeight: "700", color: "#0f172a" }}>Recent jobs</Text>
            <Text style={{ fontSize: 12, color: "#64748b" }}>Assigned to you · tap to open</Text>
          </View>
          <Link href="/(tabs)/jobs" asChild>
            <Pressable style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f1f5f9" }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#0ea5e9" }}>See all</Text>
            </Pressable>
          </Link>
        </View>

        {state.kind === "loading" ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ fontSize: 12, color: "#64748b" }}>Loading jobs…</Text>
          </View>
        ) : null}

        {state.kind === "no-env" ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>
              Supabase not configured on this device. Jobs will appear once EXPO_PUBLIC_SUPABASE_URL is set. You can still create drafts locally via the Create tab.
            </Text>
            <Link href="/(tabs)/create" asChild>
              <Pressable style={{ marginTop: 12, backgroundColor: "#0ea5e9", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Create draft</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        {state.kind === "error" ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#dc2626", fontWeight: "600", fontSize: 13 }}>Couldn&apos;t load jobs</Text>
            <Text style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{state.message}</Text>
            <Pressable onPress={fetchData} style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {state.kind === "empty" ? (
          <View style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>No jobs yet — create an assessment or inspection to begin.</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => router.push({ pathname: "/(tabs)/create", params: { mode: "assessment", pack: "solar" } })} style={{ backgroundColor: "#0ea5e9", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Start Solar</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: "/(tabs)/create", params: { mode: "assessment", pack: "cctv" } })} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ fontWeight: "600", fontSize: 12 }}>Start CCTV</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {state.kind === "ready" ? (
          <View>
            {state.rows.slice(0, 5).map((row) => {
              const siteName = row.sites?.name ?? ((row.context as { siteName?: string })?.siteName as string) ?? "Untitled site";
              const isDraft = row.status === "draft";
              return (
                <Pressable
                  key={row.id}
                  onPress={() => router.push(`/assessments/${row.id}`)}
                  style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontWeight: "600", color: "#0f172a", fontSize: 13 }} numberOfLines={1}>
                      {siteName}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#64748b" }}>
                      {row.pack.toUpperCase()} · {row.mode} · {row.status}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#94a3b8" }}>Updated {timeAgo(row.updated_at)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={{ backgroundColor: isDraft ? "#fef3c7" : "#e0f2fe", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: isDraft ? "#92400e" : "#0369a1" }}>{row.status}</Text>
                    </View>
                    {isDraft ? (
                      <Text style={{ fontSize: 11, color: "#0ea5e9", fontWeight: "600" }}>Resume draft →</Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: "#64748b" }}>Open →</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
            <Link href="/(tabs)/jobs" asChild>
              <Pressable style={{ padding: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#0ea5e9" }}>View all jobs</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}
      </View>

      <Text style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        Templates: {Object.values(PACK_TEMPLATES).map((t) => t.label).join(" · ")} — via @eval-ai/shared · 
      </Text>
    </ScrollView>
  );
}
