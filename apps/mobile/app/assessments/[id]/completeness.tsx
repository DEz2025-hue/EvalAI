import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import type { CompletenessResult, CompletenessTarget } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";

const card = { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 } as const;
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
      if (!res.ok) throw new Error(d.error ?? "Could not compute completeness");
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

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 18, color: "#0f172a" }}>Completeness review</Text>
      {error ? <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#b91c1c" }}>{error}</Text></View> : null}
      {data ? (
        <>
          <View style={{ backgroundColor: data.ready ? "#f0fdf4" : "#fef2f2", borderWidth: 1, borderColor: data.ready ? "#bbf7d0" : "#fecaca", borderRadius: 10, padding: 10 }}>
            <Text style={{ fontSize: 12, color: data.ready ? "#166534" : "#991b1b" }}>
              {data.ready ? "Ready to finalize — no blocking issues. Check the warnings first." : data.blockers.length + " blocking issue(s) must be fixed before this can be finalized."}
            </Text>
          </View>
          <View style={[card, { flexDirection: "row", flexWrap: "wrap", gap: 12 }]}>
            {([["Pass", data.counts.pass], ["Not checked", data.counts.not_checked], ["Fail", data.counts.fail], ["Needs attention", data.counts.needs_attention], ["N/A", data.counts.not_applicable], ["Items", data.total]] as Array<[string, number]>).map(([label, n]) => (
              <View key={label} style={{ minWidth: 90 }}><Text style={{ fontSize: 18, fontWeight: "800", color: "#0f172a" }}>{n}</Text><Text style={{ fontSize: 10, color: "#64748b" }}>{label}</Text></View>
            ))}
          </View>
          <View style={card}>
            <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Blockers ({data.blockers.length})</Text>
            {data.blockers.length === 0 ? <Text style={{ fontSize: 12, color: "#64748b" }}>No blockers.</Text> : data.blockers.map((b, i) => (
              <Pressable key={i} onPress={() => go(b.target)}><Text style={{ fontSize: 12, color: "#b91c1c" }}>• {b.reason} →</Text></Pressable>
            ))}
          </View>
          <View style={card}>
            <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Warnings ({data.warnings.length}) — advisory</Text>
            {data.warnings.length === 0 ? <Text style={{ fontSize: 12, color: "#64748b" }}>No warnings.</Text> : data.warnings.map((w, i) => (
              <Pressable key={i} onPress={() => go(w.target)}><Text style={{ fontSize: 12, color: "#92400e" }}>• {w.reason} →</Text></Pressable>
            ))}
          </View>
        </>
      ) : null}
      <Text style={{ fontSize: 11, color: "#94a3b8" }}>Not Checked is never treated as Pass. The same rules are enforced when you finalize a report.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={() => go("checklist")} style={{ flex: 1, backgroundColor: "#0ea5e9", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Checklist →</Text></Pressable>
        <Pressable onPress={() => router.push(("/assessments/" + jobId + "/report") as never)} style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 12 }}>Report →</Text></Pressable>
      </View>
    </ScrollView>
  );
}
