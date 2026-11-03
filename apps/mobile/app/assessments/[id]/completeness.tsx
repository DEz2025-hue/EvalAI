import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import type { CompletenessResult, CompletenessTarget } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";
import { colors, space } from "../../../lib/theme";
import { Banner, Button, Card, ErrorState, ListRow, Loading, ProgressBar, Screen, SectionHeader, Stat, Text } from "../../../components/ui";

const PATH: Record<CompletenessTarget, string> = { checklist: "checklist", findings: "findings", materials: "materials", clarify: "clarify", evidence: "evidence" };

/** Server-computed completeness review — the same rules that gate finalizing a report. */
export default function MobileCompleteness() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = String(id);
  const router = useRouter();
  const [data, setData] = useState<CompletenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      apiBase();
      const res = await apiFetch("/api/completeness?assessmentId=" + jobId);
      const d = (await res.json().catch(() => ({}))) as CompletenessResult & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not check progress");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const go = (t: CompletenessTarget) => router.push(("/assessments/" + jobId + "/" + PATH[t]) as never);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Progress" }} />
      {loading ? <Loading label="Checking progress…" variant="card" rows={4} /> : null}
      {error ? <ErrorState title="Couldn't check progress" message={error} onRetry={load} /> : null}
      {data ? (
        <>
          <Banner
            tone={data.ready ? "success" : "danger"}
            title={data.ready ? "Ready to finalize" : `${data.blockers.length} thing${data.blockers.length === 1 ? "" : "s"} to fix first`}
            message={data.ready ? "Nothing is blocking the report. Review any warnings below first." : "These must be sorted before the report can be finalized."}
          />

          <Card>
            <View style={{ gap: space.xs }}>
              <ProgressBar value={data.total - data.counts.not_checked} total={data.total} tone={data.ready ? "success" : "accent"} />
              <Text variant="caption">{data.total - data.counts.not_checked} of {data.total} items checked</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
              <Stat value={data.counts.pass} label="Pass" tone="success" />
              <Stat value={data.counts.fail} label="Issues" tone="danger" />
              <Stat value={data.counts.needs_attention} label="Needs attention" tone="warning" />
              <Stat value={data.counts.not_checked} label="Not checked" />
              <Stat value={data.counts.not_applicable} label="N/A" />
              <Stat value={data.total} label="Total items" />
            </View>
          </Card>

          {data.blockers.length ? (
            <Card padded={false}>
              <View style={{ padding: space.lg, paddingBottom: space.sm }}><SectionHeader title="Must fix" /></View>
              {data.blockers.map((b, i, arr) => (
                <ListRow key={i} icon="close-circle" iconColor={colors.danger} title={b.reason} onPress={() => go(b.target)} last={i === arr.length - 1} />
              ))}
            </Card>
          ) : null}

          {data.warnings.length ? (
            <Card padded={false}>
              <View style={{ padding: space.lg, paddingBottom: space.sm }}><SectionHeader title="Worth checking" subtitle="These won't block the report." /></View>
              {data.warnings.map((w, i, arr) => (
                <ListRow key={i} icon="alert-circle" iconColor={colors.warning} title={w.reason} onPress={() => go(w.target)} last={i === arr.length - 1} />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Checklist" icon="checkbox-outline" variant="secondary" onPress={() => go("checklist")} style={{ flex: 1 }} />
        <Button title="Report" icon="document-text-outline" variant="accent" onPress={() => router.push(("/assessments/" + jobId + "/report") as never)} style={{ flex: 1 }} />
      </View>
      <Text variant="caption" color={colors.textSubtle} style={{ textAlign: "center" }}>Items you haven't checked never count as passed.</Text>
    </Screen>
  );
}
