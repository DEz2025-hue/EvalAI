import { useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { apiFetch, apiBase } from "../lib/api";
import { getSupabase } from "../lib/supabase";

type Finding = { title: string; description?: string; severity?: "low" | "medium" | "high"; evidenceRefs?: string[]; requiresHumanReview?: boolean; uncertainty?: string; savedId?: string };

export function AiDraftPanelMobile({ assessmentId, pack, mode }: { assessmentId: string; pack: "solar" | "cctv"; mode: "assessment" | "inspection" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [draftText, setDraftText] = useState<Record<number, string>>({});
  const [meta, setMeta] = useState<{ uncertainty?: string; missingInformation?: string[]; assumptions?: string[]; fallback?: boolean } | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      try {
        apiBase();
      } catch {
        // If no API base, use local fallback placeholder (still editable)
        setFindings([{ title: "Fallback — provider not configured", description: "AI analysis is not configured yet. Your saved checklist and evidence remain intact.", requiresHumanReview: true, uncertainty: "high" }]);
        setMeta({ uncertainty: "high — not verified", missingInformation: ["pending"], assumptions: ["Fallback, not model output"], fallback: true });
        return;
      }
      // Analyze the ACTUAL saved field data — never empty placeholders.
      const [respRes, evRes, itemRes] = await Promise.all([
        apiFetch(`/api/checklist/responses?assessmentId=${assessmentId}`).then((r) => (r.ok ? r.json() : { responses: [] })).catch(() => ({ responses: [] })),
        apiFetch(`/api/evidence/upload?assessmentId=${assessmentId}`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
        apiFetch(`/api/checklist/items?assessmentId=${assessmentId}`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      ]);
      const titles = new Map<string, string>(((itemRes as { items?: Array<{ id: string; title: string }> }).items ?? []).map((it) => [it.id, it.title]));
      const validStatus = (s: string): "pass" | "fail" | "needs_attention" | "not_applicable" | "not_checked" =>
        (["pass", "fail", "needs_attention", "not_applicable", "not_checked"] as const).includes(s as "pass") ? (s as "pass") : "not_checked";
      const checklistResponses = (((respRes as { responses?: Array<{ itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string }> }).responses ?? []) as Array<{ itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string }>).map((r) => ({ itemId: r.itemId, title: titles.get(r.itemId) ?? r.itemId, status: validStatus(r.status), notes: r.notes, measuredValue: r.measuredValue, measuredUnit: r.measuredUnit }));
      const res = await apiFetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, mode, pack, checklistResponses, evidenceRefs: (((evRes as { items?: Array<{ storage_key: string }> }).items ?? []).map((e) => e.storage_key)) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analyze failed");
      const d = data as { potentialFindings?: Finding[]; potential_findings?: Finding[]; uncertainty?: string; missingInformation?: string[]; missing_information?: string[]; assumptions?: string[]; _fallback?: boolean };
      setFindings((d.potentialFindings ?? d.potential_findings ?? []).map((f) => ({ ...f, savedId: undefined })));
      setDraftText({});
      setMeta({ uncertainty: d.uncertainty, missingInformation: d.missingInformation ?? d.missing_information, assumptions: d.assumptions, fallback: !!d._fallback });
      if (d._fallback) setError("Fallback draft — provider not reachable, your saved work remains intact. Edit and save manually.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveFinding(idx: number) {
    const f = findings[idx];
    const description = draftText[idx] ?? f.description ?? "";
    try {
      const res = await apiFetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, title: f.title, description, severity: f.severity, evidenceRefs: f.evidenceRefs ?? [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Could not save finding");
      const savedId = (data as { finding?: { id?: string } }).finding?.id;
      setFindings((prev) => prev.map((p, i) => (i === idx ? { ...p, savedId } : p)));
      return;
    } catch {
      // API unreachable — fall back to a direct workspace insert when signed in.
    }
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("API and database both unreachable — finding kept on screen only.");
      const { data, error } = await supabase.from("findings").insert({ assessment_id: assessmentId, title: f.title, severity: f.severity ?? null, status: "needs_review", evidence_refs: f.evidenceRefs ?? [] }).select("id").single();
      if (error) throw new Error(error.message);
      setFindings((prev) => prev.map((p, i) => (i === idx ? { ...p, savedId: (data as { id: string }).id } : p)));
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff", padding: 12, gap: 10 }}>
      <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>AI drafts — user-requested, editable before save</Text>
      <Text style={{ fontSize: 11, color: "#64748b" }}>Each draft is editable before you save it.</Text>

      <Pressable onPress={runAnalysis} disabled={loading} style={{ backgroundColor: loading ? "#94a3b8" : "#0f172a", paddingVertical: 10, borderRadius: 8, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{loading ? "Analyzing…" : "Request AI analysis"}</Text>
      </Pressable>

      {error ? <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#dc2626" }}>{error} — continue manually, checklist and evidence are still saved.</Text></View> : null}

      {meta ? (
        <View style={{ backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, gap: 4 }}>
          <Text style={{ fontSize: 11, color: "#0f172a" }}>Uncertainty: <Text style={{ fontWeight: "700" }}>{meta.uncertainty ?? "—"}</Text> {meta.fallback ? <Text style={{ backgroundColor: "#fef3c7", color: "#92400e" }}> fallback</Text> : null}</Text>
          {meta.missingInformation?.length ? <Text style={{ fontSize: 11, color: "#475569" }}>Missing: {meta.missingInformation.join("; ")}</Text> : null}
          {meta.assumptions?.length ? <Text style={{ fontSize: 11, color: "#475569" }}>Assumptions: {meta.assumptions.join("; ")}</Text> : null}
        </View>
      ) : null}

      {findings.length > 0 ? (
        <View style={{ gap: 8 }}>
          {findings.map((f, i) => (
            <View key={i} style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10, gap: 8, backgroundColor: "#fff" }}>
              <Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>{f.title} {f.severity ? <Text style={{ fontSize: 10, backgroundColor: "#f1f5f9", paddingHorizontal: 4 }}> {f.severity}</Text> : null} <Text style={{ fontSize: 10, backgroundColor: "#fef3c7", color: "#92400e" }}>{f.savedId ? " saved · needs review" : " draft — requires review"}</Text></Text>
              <TextInput value={draftText[i] ?? f.description ?? ""} onChangeText={(v) => setDraftText((prev) => ({ ...prev, [i]: v }))} multiline style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 12, color: "#0f172a", backgroundColor: "#fff", minHeight: 56 }} />
              <Text style={{ fontSize: 10, color: "#64748b" }}>Evidence refs: {(f.evidenceRefs ?? []).join(", ") || "— (invalid refs stripped)"} · Uncertainty: {f.uncertainty ?? meta?.uncertainty ?? "—"}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => saveFinding(i)} disabled={!!f.savedId} style={{ backgroundColor: f.savedId ? "#16a34a" : "#0f172a", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{f.savedId ? "Saved ✓" : "Save finding (editable)"}</Text></Pressable>
                <Pressable onPress={() => setFindings((prev) => prev.filter((_, idx) => idx !== i))} style={{ borderWidth: 1, borderColor: "#e2e8f0", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}><Text style={{ fontSize: 12, color: "#475569" }}>Discard</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 11, color: "#64748b" }}>No drafts yet — press Request to generate. Drafts are editable before save and never overwrite verified facts.</Text>
      )}
    </View>
  );
}
