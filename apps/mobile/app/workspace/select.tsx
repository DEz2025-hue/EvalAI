import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { setActiveWorkspace } from "../../lib/workspace";

type WS = { workspace_id: string; workspaces: { name: string } | null };

export default function WorkspaceSelect() {
  const router = useRouter();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "no-env" } | { kind: "error"; message: string } | { kind: "ready"; rows: WS[] }>({ kind: "loading" });

  const fetchWS = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setState({ kind: "no-env" });
      return;
    }
    const supabase = getSupabase()!;
    setState({ kind: "loading" });
    try {
      const { data, error } = await supabase.from("workspace_memberships").select("workspace_id, workspaces(name)");
      if (error) throw new Error(error.message);
      setState({ kind: "ready", rows: (data ?? []) as unknown as WS[] });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => { fetchWS(); }, [fetchWS]);
  useFocusEffect(useCallback(() => { fetchWS(); }, [fetchWS]));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: "800", fontSize: 18, color: "#0f172a" }}>Select workspace</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>Only workspaces you belong to are shown. Switching refreshes your jobs and reports.</Text>

      {state.kind === "loading" ? <View style={{ padding: 24, alignItems: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading workspaces…</Text></View> : null}
      {state.kind === "no-env" ? <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16 }}><Text style={{ fontSize: 13, color: "#64748b" }}>Sign in to see your workspaces. You will only see workspaces you are a member of.</Text></View> : null}
      {state.kind === "error" ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 12 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{state.message}</Text><Pressable onPress={fetchWS} style={{ marginTop: 8, backgroundColor: "#0f172a", padding: 8, borderRadius: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Retry</Text></Pressable></View> : null}

      {state.kind === "ready" ? (
        state.rows.length === 0 ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: "#64748b" }}>No workspaces — you’re not yet a member. Accept an invitation or create one via web (authenticated POST workspaces with ).</Text>
          </View>
        ) : (
          state.rows.map((r) => (
            <Pressable key={r.workspace_id} onPress={() => { void (async () => { await setActiveWorkspace(r.workspace_id); router.replace("/(tabs)"); })(); }} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontWeight: "700", color: "#0f172a" }}>{r.workspaces?.name ?? r.workspace_id.slice(0, 8)}</Text>
                <Text style={{ fontSize: 11, color: "#64748b" }}>{r.workspace_id.slice(0, 8)} · tap to switch — </Text>
              </View>
              <Text style={{ color: "#0ea5e9", fontWeight: "700" }}>Select →</Text>
            </Pressable>
          ))
        )
      ) : null}
    </ScrollView>
  );
}
