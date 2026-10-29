import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";

type Finding = { id: string; title: string; description?: string; severity?: "low" | "medium" | "high"; status: string; evidenceRefs: string[]; createdAt: string };

export default function MobileFindings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        apiBase();
      } catch {
        setFindings([]);
        setError("Set EXPO_PUBLIC_APP_URL to list findings.");
        return;
      }
      const res = await apiFetch(`/api/findings?assessmentId=${String(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load");
      setFindings(((data as { findings?: Finding[] }).findings ?? []) as Finding[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function review(findingId: string, status: "confirmed" | "rejected") {
    try {
      const res = await apiFetch("/api/findings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: findingId, status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Review failed");
      setFindings((prev) => prev.map((f) => (f.id === findingId ? { ...f, status } : f)));
    } catch (e) {
      Alert.alert("Review failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>Findings — {String(id).slice(0, 8)}</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>Human-reviewed findings. Drafts land here after Save, unconfirmed until you confirm.</Text>
      {loading ? <View style={{ padding: 24, alignItems: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading findings…</Text></View> : null}
      {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error}</Text></View> : null}
      {!loading && findings.length === 0 && !error ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>No findings yet — request AI analysis on the job hub, edit a draft, Save finding.</Text>
        </View>
      ) : null}
      {findings.map((f) => (
        <View key={f.id} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 }}>
          <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>{f.title}</Text>
          {f.description ? <Text style={{ fontSize: 12, color: "#475569" }}>{f.description}</Text> : null}
          <Text style={{ fontSize: 11, color: "#64748b" }}>{f.severity ?? "—"} · {f.status.replace("_", " ")} · evidence: {f.evidenceRefs.length > 0 ? f.evidenceRefs.join(", ") : "—"}</Text>
          {f.status === "needs_review" ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => review(f.id, "confirmed")} style={{ backgroundColor: "#16a34a", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Confirm</Text></Pressable>
              <Pressable onPress={() => review(f.id, "rejected")} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}><Text style={{ fontSize: 12, color: "#475569" }}>Reject</Text></Pressable>
            </View>
          ) : null}
        </View>
      ))}
      <Pressable onPress={() => router.push(`/assessments/${String(id)}` as never)} style={{ paddingVertical: 8 }}><Text style={{ fontSize: 12, color: "#0ea5e9" }}>Back to job</Text></Pressable>
    </ScrollView>
  );
}
