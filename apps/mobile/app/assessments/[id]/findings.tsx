import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect, Link } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";
import { useRole } from "../../../lib/role";
import { colors, space, type Tone } from "../../../lib/theme";
import { Badge, Banner, Button, Card, Chip, EmptyState, Field, Loading, Screen, Text } from "../../../components/ui";

type Finding = { id: string; title: string; description?: string; severity?: "low" | "medium" | "high"; status: string; evidenceRefs: string[]; uncertainty?: string; missingInputs?: string[]; reviewedAt?: string; createdAt: string };
type Evidence = { id: string; storage_key: string };

const STATUS_BADGE: Record<string, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  needs_review: { label: "Needs review", tone: "warning" },
};
const SEVERITY_TONE: Record<string, Tone> = { low: "info", medium: "warning", high: "danger" };

export default function MobileFindings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = String(id);
  const { canWrite, loaded } = useRole();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "" as "" | "low" | "medium" | "high", uncertainty: "", refs: [] as string[] });

  const load = useCallback(async () => {
    setError(null);
    try {
      apiBase();
      const [f, e] = await Promise.all([apiFetch("/api/findings?assessmentId=" + jobId), apiFetch("/api/evidence/upload?assessmentId=" + jobId)]);
      const fd = (await f.json().catch(() => ({}))) as { findings?: Finding[]; error?: string };
      if (!f.ok) throw new Error(fd.error ?? "Failed to load findings");
      setFindings(fd.findings ?? []);
      if (e.ok) setEvidence(((await e.json()) as { items?: Evidence[] }).items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function review(findingId: string, status: "confirmed" | "rejected" | "needs_review") {
    setError(null);
    try {
      const res = await apiFetch("/api/findings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: findingId, status }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addFinding() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: jobId, title: form.title.trim(), description: form.description.trim() || undefined, severity: form.severity || undefined, uncertainty: form.uncertainty.trim() || undefined, evidenceRefs: form.refs }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save finding");
      setForm({ title: "", description: "", severity: "", uncertainty: "", refs: [] });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const toggleRef = (evId: string) => setForm((f) => ({ ...f, refs: f.refs.includes(evId) ? f.refs.filter((r) => r !== evId) : [...f.refs, evId] }));
  const unreviewed = findings.filter((f) => f.status === "needs_review").length;

  if (loading) return <Screen><Stack.Screen options={{ title: "Findings" }} /><Loading label="Loading findings…" /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Findings" }} />
      <Text variant="caption">Each finding links back to its evidence and stays unconfirmed until someone reviews it.{unreviewed ? ` ${unreviewed} waiting for review.` : ""}</Text>
      {error ? <Banner tone="danger" message={error} /> : null}
      {loaded && !canWrite ? <Banner tone="neutral" message="You have view-only access in this workspace." /> : null}

      {canWrite ? (
        adding ? (
          <Card style={{ gap: space.lg }}>
            <Text variant="heading">New finding</Text>
            <Field label="Title" required value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} placeholder="What's the issue?" maxLength={300} />
            <Field label="Description" value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} placeholder="Details, location, impact" multiline maxLength={5000} />
            <View style={{ gap: space.sm }}>
              <Text variant="label" color={colors.text}>Severity</Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {(["", "low", "medium", "high"] as const).map((s) => <Chip key={s || "none"} label={s ? s[0].toUpperCase() + s.slice(1) : "Not rated"} tone={s ? SEVERITY_TONE[s] : undefined} active={form.severity === s} onPress={() => setForm({ ...form, severity: s })} />)}
              </View>
            </View>
            <Field label="What's uncertain?" value={form.uncertainty} onChangeText={(t) => setForm({ ...form, uncertainty: t })} placeholder="Anything you couldn't confirm" maxLength={500} />
            <View style={{ gap: space.sm }}>
              <Text variant="label" color={colors.text}>Supporting photos and audio</Text>
              {evidence.length === 0 ? <Text variant="caption">Nothing uploaded yet — capture photos on the job first to link them.</Text> : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {evidence.map((ev) => <Chip key={ev.id} icon="attach" label={(ev.storage_key.split("/").pop() ?? ev.id).slice(0, 26)} tone="accent" active={form.refs.includes(ev.id)} onPress={() => toggleRef(ev.id)} />)}
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
              <Button title={saving ? "Saving…" : "Save finding"} variant="accent" onPress={addFinding} loading={saving} disabled={form.title.trim().length < 3} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Button title="Add finding" icon="add" variant="secondary" onPress={() => setAdding(true)} />
        )
      ) : null}

      {findings.length === 0 ? (
        <EmptyState icon="flag-outline" title="No findings yet" message="Add one yourself, or run an AI analysis on the job and keep the drafts you agree with." />
      ) : findings.map((f) => {
        const st = STATUS_BADGE[f.status] ?? { label: f.status.replace("_", " "), tone: "neutral" as Tone };
        return (
          <Card key={f.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Badge label={st.label} tone={st.tone} />
              {f.severity ? <Badge label={`${f.severity[0].toUpperCase()}${f.severity.slice(1)} severity`} tone={SEVERITY_TONE[f.severity]} /> : null}
            </View>
            <Text variant="heading">{f.title}</Text>
            {f.description ? <Text variant="body" color={colors.textMuted}>{f.description}</Text> : null}
            {f.uncertainty ? <Text variant="caption" color={colors.warning}>Uncertain: {f.uncertainty}</Text> : null}
            {f.missingInputs && f.missingInputs.length > 0 ? <Text variant="caption">Missing: {f.missingInputs.join("; ")}</Text> : null}
            <Text style={{ fontSize: 11, color: colors.textSubtle }}>{f.evidenceRefs.length} linked file{f.evidenceRefs.length === 1 ? "" : "s"} · {new Date(f.createdAt).toLocaleDateString()}{f.reviewedAt ? " · reviewed " + new Date(f.reviewedAt).toLocaleDateString() : ""}</Text>
            {canWrite ? (
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
                {f.status === "needs_review" ? (
                  <>
                    <Button title="Confirm" icon="checkmark" variant="accent" size="sm" onPress={() => void review(f.id, "confirmed")} />
                    <Button title="Reject" icon="close" variant="secondary" size="sm" onPress={() => void review(f.id, "rejected")} />
                  </>
                ) : (
                  <Button title="Reopen review" icon="refresh" variant="secondary" size="sm" onPress={() => void review(f.id, "needs_review")} />
                )}
              </View>
            ) : null}
          </Card>
        );
      })}

      <Link href={("/assessments/" + jobId + "/completeness") as never} asChild>
        <Button title="Check progress" icon="pie-chart-outline" variant="ghost" />
      </Link>
    </Screen>
  );
}
