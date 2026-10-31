import { useState } from "react";
import { View, Alert } from "react-native";
import type { PackId } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../lib/api";
import { colors, radius, space } from "../lib/theme";
import { Badge, Banner, Button, Card, Field, SectionHeader, Text } from "./ui";

type Finding = { title: string; description?: string; severity?: "low" | "medium" | "high"; evidenceRefs?: string[]; requiresHumanReview?: boolean; uncertainty?: string; savedId?: string };

export function AiDraftPanelMobile({ assessmentId, pack, mode }: { assessmentId: string; pack: PackId; mode: "assessment" | "inspection" }) {
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
        setFindings([]);
        setMeta(null);
        setError("AI suggestions aren't available right now.");
        return;
      }
      // The server assembles the analysis input from stored facts; only the assessment id is sent.
      const res = await apiFetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analyze failed");
      const d = data as { potentialFindings?: Finding[]; potential_findings?: Finding[]; uncertainty?: string; missingInformation?: string[]; missing_information?: string[]; assumptions?: string[]; _fallback?: boolean };
      setFindings((d.potentialFindings ?? d.potential_findings ?? []).map((f) => ({ ...f, savedId: undefined })));
      setDraftText({});
      setMeta({ uncertainty: d.uncertainty, missingInformation: d.missingInformation ?? d.missing_information, assumptions: d.assumptions, fallback: !!d._fallback });
      if (d._fallback) setError("The AI service couldn't be reached, so these are basic drafts only.");
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
    } catch (e) {
      // Saved only through the server, which validates, keeps the description and writes the audit log.
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't save finding", `${msg.replace(/\.?$/, ".")} Your draft is still here — try again.`);
    }
  }

  return (
    <Card>
      <SectionHeader title="AI suggestions" subtitle="Only runs when you ask. Every suggestion is a draft you can edit, save or discard." />

      <Button title={loading ? "Analyzing…" : findings.length ? "Run again" : "Suggest findings"} icon="sparkles" variant="primary" onPress={runAnalysis} loading={loading} />

      {error ? <Banner tone="danger" message={`${error} You can keep working manually — your checklist and photos are still saved.`} /> : null}

      {meta ? (
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: space.md, gap: 4 }}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Text variant="caption" color={colors.text}>Confidence: <Text variant="caption" color={colors.text} style={{ fontWeight: "700" }}>{meta.uncertainty ?? "—"}</Text></Text>
            {meta.fallback ? <Badge label="Offline draft" tone="warning" /> : null}
          </View>
          {meta.missingInformation?.length ? <Text variant="caption">Missing: {meta.missingInformation.join("; ")}</Text> : null}
          {meta.assumptions?.length ? <Text variant="caption">Assumes: {meta.assumptions.join("; ")}</Text> : null}
        </View>
      ) : null}

      {findings.map((f, i) => (
        <View key={i} style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <Badge label={f.savedId ? "Saved · needs review" : "Draft"} tone={f.savedId ? "success" : "warning"} />
            {f.severity ? <Badge label={f.severity} tone={f.severity === "high" ? "danger" : f.severity === "medium" ? "warning" : "info"} /> : null}
          </View>
          <Text variant="bodyStrong">{f.title}</Text>
          <Field value={draftText[i] ?? f.description ?? ""} onChangeText={(v) => setDraftText((prev) => ({ ...prev, [i]: v }))} multiline />
          <Text style={{ fontSize: 11, color: colors.textSubtle }}>{(f.evidenceRefs ?? []).length} linked file{(f.evidenceRefs ?? []).length === 1 ? "" : "s"}{f.uncertainty ? ` · confidence ${f.uncertainty}` : ""}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title={f.savedId ? "Saved" : "Save as finding"} icon={f.savedId ? "checkmark" : "save-outline"} variant={f.savedId ? "secondary" : "accent"} size="sm" onPress={() => saveFinding(i)} disabled={!!f.savedId} />
            <Button title="Discard" variant="ghost" size="sm" onPress={() => setFindings((prev) => prev.filter((_, idx) => idx !== i))} />
          </View>
        </View>
      ))}
    </Card>
  );
}
