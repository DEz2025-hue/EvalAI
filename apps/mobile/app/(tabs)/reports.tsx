import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Linking, Alert } from "react-native";
import { useFocusEffect, Link } from "expo-router";
import { apiFetch, apiBase } from "../../lib/api";

type Snap = { id: string; assessmentId: string; assessmentVersion: number; checklistVersion: string; materialsVersion: number | null; finalized: boolean; createdAt: string };

type State = { kind: "loading" } | { kind: "no-env" } | { kind: "error"; message: string } | { kind: "empty" } | { kind: "ready"; snaps: Snap[] };

export default function ReportsScreen() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const fetchSnaps = useCallback(async () => {
    try {
      apiBase();
    } catch {
      setState({ kind: "no-env" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await apiFetch("/api/reports/snapshot");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed");
      const snaps = ((data as { snapshots?: Snap[] }).snapshots ?? []) as Snap[];
      if (snaps.length === 0) setState({ kind: "empty" });
      else setState({ kind: "ready", snaps });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => { fetchSnaps(); }, [fetchSnaps]);
  useFocusEffect(useCallback(() => { fetchSnaps(); }, [fetchSnaps]));

  async function openSnap(snap: Snap) {
    try {
      apiBase();
    } catch {
      Alert.alert("No API", "Set EXPO_PUBLIC_APP_URL to open report signed URL.");
      return;
    }
    try {
      const res = await apiFetch("/api/reports/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: snap.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Open failed");
      const d = data as { signedUrl?: string; artifactKey?: string };
      if (d.signedUrl) await Linking.openURL(d.signedUrl);
      else Alert.alert("Report", `Artifact ${d.artifactKey ?? snap.id} — signed URL pending Storage config.`);
    } catch (e) {
      Alert.alert("Open failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchSnaps(); setRefreshing(false); }} />}>
      <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14 }}>
        <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>Reports</Text>
        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Finalized reports are preserved — later edits create a new version.</Text>
      </View>

      {state.kind === "loading" ? <View style={{ padding: 24, alignItems: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading reports…</Text></View> : null}
      {state.kind === "no-env" ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 16, alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>Set EXPO_PUBLIC_APP_URL to list reports (e.g. https://your-app.vercel.app). Without it, finalize via web or mobile detail → Report.</Text>
          <Link href="/(tabs)/jobs" asChild><Pressable style={{ marginTop: 12, backgroundColor: "#0ea5e9", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700" }}>View jobs</Text></Pressable></Link>
        </View>
      ) : null}
      {state.kind === "error" ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 12 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{state.message}</Text><Pressable onPress={fetchSnaps} style={{ marginTop: 8, backgroundColor: "#0f172a", padding: 8, borderRadius: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Retry</Text></Pressable></View> : null}
      {state.kind === "empty" ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: "#64748b" }}>No reports yet</Text>
          <Text style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Finalize an assessment via Jobs → Detail → Report → Finalize.</Text>
        </View>
      ) : null}
      {state.kind === "ready" ? (
        <View style={{ gap: 10 }}>
          {state.snaps.map((s) => (
            <Pressable key={s.id} onPress={() => openSnap(s)} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{s.id.slice(0, 12)} · v{s.assessmentVersion}</Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: s.finalized ? "#15803d" : "#92400e", backgroundColor: s.finalized ? "#dcfce7" : "#fef3c7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>{s.finalized ? "finalized (immutable)" : "draft"}</Text>
              </View>
              <Text style={{ fontSize: 11, color: "#64748b" }}>{s.assessmentId.slice(0, 8)} · {s.checklistVersion}{s.materialsVersion ? ` · mats v${s.materialsVersion}` : " · no mats"} · {new Date(s.createdAt).toLocaleString()}</Text>
              <Text style={{ fontSize: 11, color: "#0ea5e9", fontWeight: "600" }}>Open signed URL →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 12, color: "#92400e" }}>Live Camera — Coming Soon</Text>
        <Text style={{ fontSize: 11, color: "#78350f", marginTop: 2 }}>Continuous guidance isn't available in this release.</Text>
      </View>
    </ScrollView>
  );
}
