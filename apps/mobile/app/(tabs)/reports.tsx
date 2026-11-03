import { useCallback, useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { useFocusEffect, Link } from "expo-router";
import { apiFetch, apiBase } from "../../lib/api";
import { Badge, Button, Card, EmptyState, ErrorState, ListRow, Loading, Screen, Text } from "../../components/ui";

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
      Alert.alert("Can't open report", "The server isn't reachable right now. Check your connection and try again.");
      return;
    }
    try {
      const res = await apiFetch("/api/reports/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: snap.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Open failed");
      const d = data as { signedUrl?: string };
      if (d.signedUrl) await Linking.openURL(d.signedUrl);
      else Alert.alert("Report not ready", "The PDF for this report isn't available yet. Try again in a moment.");
    } catch (e) {
      Alert.alert("Couldn't open report", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen onRefresh={async () => { setRefreshing(true); await fetchSnaps(); setRefreshing(false); }} refreshing={refreshing}>
      <Text variant="caption">Finalized reports are locked — any later edits create a new version.</Text>

      {state.kind === "loading" ? <Loading label="Loading reports…" rows={4} /> : null}
      {state.kind === "no-env" ? (
        <EmptyState icon="cloud-offline-outline" title="Reports can't load right now" message="Check your connection, or open a job and go to its Report." action={<Link href="/(tabs)/jobs" asChild><Button title="View jobs" variant="secondary" size="sm" /></Link>} />
      ) : null}
      {state.kind === "error" ? <ErrorState title="Couldn't load reports" message={state.message} onRetry={fetchSnaps} /> : null}
      {state.kind === "empty" ? (
        <EmptyState icon="document-text-outline" title="No reports yet" message="Open a job, go to Report, and finalize it to see it here." />
      ) : null}
      {state.kind === "ready" ? (
        <Card padded={false}>
          {state.snaps.map((s, i, arr) => (
            <ListRow
              key={s.id}
              icon={s.finalized ? "document-lock-outline" : "document-outline"}
              title={`Report v${s.assessmentVersion}`}
              subtitle={`Job ${s.assessmentId.slice(0, 8)} · ${s.materialsVersion ? `materials v${s.materialsVersion}` : "no materials"}`}
              meta={new Date(s.createdAt).toLocaleString()}
              right={<Badge label={s.finalized ? "Final" : "Draft"} tone={s.finalized ? "success" : "warning"} />}
              onPress={() => openSnap(s)}
              last={i === arr.length - 1}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
