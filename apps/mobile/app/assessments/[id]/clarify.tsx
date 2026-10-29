import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";

type Q = { id: string; question: string; type?: string; options?: string[]; required?: boolean };

export default function MobileClarify() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let configured = true;
        try {
          apiBase();
        } catch {
          configured = false;
        }
        // Clarify runs on request only — no auto AI call on mount. Manual questions first.
        setQuestions([
          { id: "q1", question: "Primary goal / scope? (Unknown if not available)", type: "text" },
          { id: "q2", question: "Existing equipment — what do you know? (Unknown if not available)", type: "text" },
          { id: "q3", question: "Access constraints or follow-up checks needed?", type: "text" },
        ]);
        if (!configured) setError("Set EXPO_PUBLIC_APP_URL to enable AI clarification — using manual questions.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function save(next: "stay" | "builder") {
    setSaving(true);
    try {
      try {
        apiBase();
      } catch {
        if (next === "builder") router.push(`/assessments/${String(id)}/checklist-builder` as never);
        else Alert.alert("Kept on this screen only", "Set EXPO_PUBLIC_APP_URL to persist answers server-side.");
        return;
      }
      const res = await apiFetch(`/api/assessments/${String(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { clarificationAnswers: answers } }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Save failed");
      }
      if (next === "builder") router.push(`/assessments/${String(id)}/checklist-builder` as never);
      else Alert.alert("Saved", "Clarification answers saved.");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={{ flex: 1, padding: 16, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /><Text style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading clarification…</Text></View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: "#0f172a" }}>M09 · Clarification</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>{String(id).slice(0, 8)} · {questions.length} questions — Unknown preserved, not invented</Text>
      {error ? <View style={{ backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#92400e" }}>{error}</Text></View> : null}
      {questions.map((q) => (
        <View key={q.id} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 8 }}>
          <Text style={{ fontWeight: "600", fontSize: 13, color: "#0f172a" }}>{q.question} {q.required ? <Text style={{ color: "#dc2626" }}>*</Text> : <Text style={{ fontSize: 11, color: "#64748b" }}> (Unknown allowed)</Text>}</Text>
          <TextInput value={answers[q.id] ?? ""} onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} placeholder={q.type === "number" ? "Number or Unknown" : "Answer or Unknown"} placeholderTextColor="#94a3b8" style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" }} />
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable onPress={() => save("stay")} disabled={saving} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}><Text style={{ fontWeight: "600", fontSize: 12, color: "#0f172a" }}>{saving ? "Saving…" : "Save"}</Text></Pressable>
        <Pressable onPress={() => save("builder")} disabled={saving} style={{ backgroundColor: saving ? "#94a3b8" : "#0ea5e9", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Save → Checklist Builder</Text></Pressable>
        <Pressable onPress={() => router.replace(`/assessments/${String(id)}` as never)} style={{ paddingHorizontal: 12, paddingVertical: 10 }}><Text style={{ fontSize: 12, color: "#64748b" }}>Back</Text></Pressable>
      </View>
    </ScrollView>
  );
}
