import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useLocalSearchParams, useFocusEffect, Link } from "expo-router";
import { apiFetch, apiBase } from "../../../lib/api";
import { useRole } from "../../../lib/role";

type Finding = { id: string; title: string; description?: string; severity?: "low" | "medium" | "high"; status: string; evidenceRefs: string[]; uncertainty?: string; missingInputs?: string[]; reviewedAt?: string; createdAt: string };
type Evidence = { id: string; storage_key: string };

const card = { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 } as const;
const input = { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff" } as const;
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  confirmed: { bg: "#dcfce7", fg: "#166534" },
  rejected: { bg: "#e2e8f0", fg: "#475569" },
  needs_review: { bg: "#fef3c7", fg: "#92400e" },
};

function Chip({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? "#0ea5e9" : "#e2e8f0", backgroundColor: active ? "#e0f2fe" : "#fff" }}>
      <Text style={{ fontSize: 11, color: active ? "#0369a1" : "#334155", fontWeight: active ? "700" : "500" }}>{text}</Text>
    </Pressable>
  );
}

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

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <Text style={{ fontWeight: "800", fontSize: 18, color: "#0f172a" }}>Findings · {findings.length}{unreviewed ? " · " + unreviewed + " to review" : ""}</Text>
      <Text style={{ fontSize: 12, color: "#64748b" }}>Every finding stays traceable to its evidence and is unconfirmed until a person reviews it. You can add findings yourself — AI is optional.</Text>
      {error ? <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#b91c1c" }}>{error}</Text></View> : null}
      {loaded && !canWrite ? <View style={{ backgroundColor: "#f8fafc", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#64748b" }}>Your role is read-only in this workspace.</Text></View> : null}

      {canWrite ? (
        adding ? (
          <View style={[card, { gap: 10 }]}>
            <TextInput value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} placeholder="Title *" placeholderTextColor="#94a3b8" maxLength={300} style={input} />
            <TextInput value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} placeholder="Description" placeholderTextColor="#94a3b8" multiline maxLength={5000} style={[input, { minHeight: 70, textAlignVertical: "top" }]} />
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {(["", "low", "medium", "high"] as const).map((s) => <Chip key={s || "none"} text={s ? s : "Not rated"} active={form.severity === s} onPress={() => setForm({ ...form, severity: s })} />)}
            </View>
            <TextInput value={form.uncertainty} onChangeText={(t) => setForm({ ...form, uncertainty: t })} placeholder="Uncertainty / what is unknown" placeholderTextColor="#94a3b8" maxLength={500} style={input} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#0f172a" }}>Supporting evidence</Text>
            {evidence.length === 0 ? <Text style={{ fontSize: 11, color: "#64748b" }}>No evidence uploaded yet — add photos first to link them.</Text> : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {evidence.map((ev) => <Chip key={ev.id} text={(ev.storage_key.split("/").pop() ?? ev.id).slice(0, 26)} active={form.refs.includes(ev.id)} onPress={() => toggleRef(ev.id)} />)}
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={addFinding} disabled={saving || form.title.trim().length < 3} style={{ flex: 1, backgroundColor: saving || form.title.trim().length < 3 ? "#94a3b8" : "#0ea5e9", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{saving ? "Saving…" : "Save finding"}</Text></Pressable>
              <Pressable onPress={() => setAdding(false)} style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 12 }}>Cancel</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 12 }}>+ Add finding</Text></Pressable>
        )
      ) : null}

      {findings.length === 0 ? (
        <View style={[card, { alignItems: "center", padding: 20 }]}><Text style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>No findings yet. Add one yourself, or request an AI analysis on the job screen and save the drafts you agree with.</Text></View>
      ) : findings.map((f) => {
        const c = STATUS_COLOR[f.status] ?? { bg: "#f1f5f9", fg: "#334155" };
        return (
          <View key={f.id} style={card}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a", flexShrink: 1 }}>{f.title}</Text>
              {f.severity ? <Text style={{ fontSize: 10, backgroundColor: "#f1f5f9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>{f.severity}</Text> : null}
              <Text style={{ fontSize: 10, backgroundColor: c.bg, color: c.fg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>{f.status.replace("_", " ")}</Text>
            </View>
            {f.description ? <Text style={{ fontSize: 12, color: "#475569" }}>{f.description}</Text> : null}
            {f.uncertainty ? <Text style={{ fontSize: 11, color: "#92400e" }}>Uncertainty: {f.uncertainty}</Text> : null}
            {f.missingInputs && f.missingInputs.length > 0 ? <Text style={{ fontSize: 11, color: "#64748b" }}>Missing: {f.missingInputs.join("; ")}</Text> : null}
            <Text style={{ fontSize: 10, color: "#94a3b8" }}>Evidence linked: {f.evidenceRefs.length} · {new Date(f.createdAt).toLocaleString()}{f.reviewedAt ? " · reviewed " + new Date(f.reviewedAt).toLocaleString() : ""}</Text>
            {canWrite ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                {f.status === "needs_review" ? (
                  <>
                    <Pressable onPress={() => void review(f.id, "confirmed")} style={{ backgroundColor: "#0ea5e9", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Confirm</Text></Pressable>
                    <Pressable onPress={() => void review(f.id, "rejected")} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }}><Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 12 }}>Reject</Text></Pressable>
                  </>
                ) : (
                  <Pressable onPress={() => void review(f.id, "needs_review")} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }}><Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 12 }}>Reopen review</Text></Pressable>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      <Link href={("/assessments/" + jobId + "/completeness") as never} asChild>
        <Pressable style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}><Text style={{ color: "#0f172a", fontWeight: "700", fontSize: 12 }}>Completeness review →</Text></Pressable>
      </Link>
    </ScrollView>
  );
}
