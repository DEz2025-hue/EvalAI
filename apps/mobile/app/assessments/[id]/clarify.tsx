import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";
import { colors, space } from "../../../lib/theme";
import { Banner, Button, Card, Field, Loading, Screen, Text } from "../../../components/ui";

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
          { id: "q1", question: "What's the main goal or scope of this job?", type: "text" },
          { id: "q2", question: "What do you already know about the existing equipment?", type: "text" },
          { id: "q3", question: "Any access constraints or follow-up checks needed?", type: "text" },
        ]);
        if (!configured) setError("AI questions aren't available right now — showing the standard questions.");
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
        else Alert.alert("Not saved", "You're offline from the server — this stays on this screen until you reconnect.");
        return;
      }
      const res = await apiFetch(`/api/assessments/${String(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { clarificationAnswers: answers } }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Save failed");
      }
      if (next === "builder") router.push(`/assessments/${String(id)}/checklist-builder` as never);
      else Alert.alert("Saved", "Your answers are saved.");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Screen><Stack.Screen options={{ title: "Questions" }} /><Loading /></Screen>;
  return (
    <>
      <Stack.Screen options={{ title: "Questions" }} />
      <Screen>
        <Text variant="caption">A few questions to fill in the gaps. If you don't know, write "Unknown" — nothing gets guessed for you.</Text>
        {error ? <Banner tone="warning" message={error} /> : null}
        <Card style={{ gap: space.lg }}>
          {questions.map((q) => (
            <Field key={q.id} label={q.question} required={q.required} value={answers[q.id] ?? ""} onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} placeholder={q.type === "number" ? "Number or Unknown" : "Your answer, or Unknown"} multiline />
          ))}
        </Card>
        <Button title="Save & set up checklist" icon="arrow-forward" variant="accent" size="lg" onPress={() => save("builder")} loading={saving} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Save" variant="secondary" onPress={() => save("stay")} disabled={saving} style={{ flex: 1 }} />
          <Button title="Back to job" variant="ghost" onPress={() => router.replace(`/assessments/${String(id)}` as never)} style={{ flex: 1 }} />
        </View>
      </Screen>
    </>
  );
}
