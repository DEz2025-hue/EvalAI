import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking, TextInput } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import type { ReportInput } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";
import { useRole } from "../../../lib/role";

type Snap = {
  id: string;
  assessmentVersion: number;
  materialsVersion: number | null;
  finalized: boolean;
  createdAt: string;
  payload?: ReportInput;
  reviewedByLabel?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};
type Narrative = { summary?: string; recommendations?: string; notes?: string };

const card = { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12, gap: 6 } as const;
const input = { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 8, fontSize: 13, color: "#0f172a", backgroundColor: "#fff", minHeight: 70, textAlignVertical: "top" } as const;
const btn = (primary: boolean, disabled = false) => ({ flex: 1, minWidth: 130, backgroundColor: disabled ? "#94a3b8" : primary ? "#0ea5e9" : "#fff", borderWidth: primary ? 0 : 1, borderColor: "#e2e8f0", paddingVertical: 10, borderRadius: 8, alignItems: "center" as const });

/** Report workflow on mobile: create a draft, read it, edit the narrative, sign off, download. */
export default function MobileReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = String(id);
  const { canWrite, loaded } = useRole();
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeMaterials, setIncludeMaterials] = useState(false);
  const [narrative, setNarrative] = useState<Narrative>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      apiBase();
      const res = await apiFetch("/api/reports/snapshot?assessmentId=" + jobId);
      const data = (await res.json().catch(() => ({}))) as { snapshots?: Snap[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load reports");
      const list = data.snapshots ?? [];
      setSnaps(list);
      setSelectedId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selected = snaps.find((s) => s.id === selectedId) ?? null;
  useEffect(() => { setNarrative(selected?.payload?.narrative ?? {}); }, [selected?.id, selected?.payload?.narrative]);
  const draft = !!selected && !selected.finalized;

  async function post(path: string, body: unknown, method = "POST") {
    const res = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data as Record<string, unknown>;
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const createDraft = () => run("create", async () => {
    const d = (await post("/api/reports/snapshot", { assessmentId: jobId, includeMaterials })) as { snapshot?: Snap };
    await load();
    if (d.snapshot) setSelectedId(d.snapshot.id);
  });

  const saveNarrative = () => run("save", async () => {
    if (!selected) return;
    await post("/api/reports/snapshot", { snapshotId: selected.id, narrative }, "PATCH");
    await load();
  });

  const finalize = () => {
    if (!selected) return;
    Alert.alert(
      "Sign off and finalize?",
      "By continuing you confirm you have read this report and checked its findings, measurements and recommendations against the evidence. The version becomes immutable and you are recorded as the reviewer.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign off", style: "destructive", onPress: () => void run("finalize", async () => { await post("/api/reports/finalize", { snapshotId: selected.id, confirmReviewed: true }); await load(); }) },
      ],
    );
  };

  const downloadPdf = () => run("pdf", async () => {
    if (!selected) return;
    const d = (await post("/api/reports/pdf", { snapshotId: selected.id })) as { signedUrl?: string | null; artifactKey?: string };
    if (d.signedUrl) await Linking.openURL(d.signedUrl);
    else Alert.alert("PDF ready", "The PDF was generated, but secure download is not available right now. Open this report on the web to download it.");
  });

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  const p = selected?.payload;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <Text style={{ fontWeight: "800", fontSize: 18, color: "#0f172a" }}>Report · {jobId.slice(0, 8)}</Text>
      {error ? <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#b91c1c" }}>{error}</Text></View> : null}
      {loaded && !canWrite ? <View style={{ backgroundColor: "#f8fafc", borderRadius: 8, padding: 10 }}><Text style={{ fontSize: 12, color: "#64748b" }}>Your role is read-only — you can read and download reports.</Text></View> : null}

      <View style={card}>
        {canWrite ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable onPress={() => setIncludeMaterials((v) => !v)} style={btn(false)}><Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>{includeMaterials ? "☑" : "☐"} Include materials</Text></Pressable>
            <Pressable onPress={createDraft} disabled={busy !== null} style={btn(true, busy !== null)}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{busy === "create" ? "Creating…" : "Create new draft"}</Text></Pressable>
          </View>
        ) : null}
        <Text style={{ fontSize: 11, color: "#64748b" }}>Versions (newest first) — tap to open</Text>
        {snaps.length === 0 ? <Text style={{ fontSize: 12, color: "#64748b" }}>No report yet. Create a draft from the saved facts, then edit, review and sign it off.</Text> : null}
        {snaps.map((s) => (
          <Pressable key={s.id} onPress={() => setSelectedId(s.id)} style={{ borderWidth: 1, borderColor: s.id === selectedId ? "#0ea5e9" : "#e2e8f0", backgroundColor: s.id === selectedId ? "#f0f9ff" : "#fff", borderRadius: 8, padding: 8, flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, color: "#0f172a" }}>v{s.assessmentVersion} · {new Date(s.createdAt).toLocaleString()}{s.materialsVersion ? " · materials v" + s.materialsVersion : ""}</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: s.finalized ? "#15803d" : "#92400e" }}>{s.finalized ? "FINAL" : "draft"}</Text>
          </Pressable>
        ))}
      </View>

      {selected && p ? (
        <View style={card}>
          <Text style={{ fontWeight: "800", fontSize: 14, color: "#0f172a" }}>{p.siteName}</Text>
          <Text style={{ fontSize: 11, color: selected.finalized ? "#15803d" : "#92400e" }}>
            {selected.finalized ? "Finalized (immutable)" + (selected.reviewedByLabel ? " · signed off by " + selected.reviewedByLabel : "") + (selected.reviewedAt ? " on " + new Date(selected.reviewedAt).toLocaleString() : "") : "DRAFT — not yet reviewed or signed off"}
          </Text>
          {selected.reviewNote ? <Text style={{ fontSize: 11, color: "#475569" }}>Note: {selected.reviewNote}</Text> : null}
          {p.narrative?.summary ? <Text style={{ fontSize: 12, color: "#0f172a" }}>{p.narrative.summary}</Text> : null}
          <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6 }}>Checklist</Text>
          {p.checklist.map((c, i) => <Text key={i} style={{ fontSize: 11, color: "#334155" }}>• {c.title} — {c.status}{c.notes ? " — " + c.notes : ""}</Text>)}
          <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6 }}>Measurements</Text>
          {p.measurements.length === 0 ? <Text style={{ fontSize: 11, color: "#64748b" }}>None recorded</Text> : p.measurements.map((m, i) => <Text key={i} style={{ fontSize: 11, color: "#334155" }}>• {m.name}: {m.value} {m.unit}</Text>)}
          <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6 }}>Findings</Text>
          {p.findings.length === 0 ? <Text style={{ fontSize: 11, color: "#64748b" }}>No confirmed findings</Text> : p.findings.map((f, i) => <Text key={i} style={{ fontSize: 11, color: "#334155" }}>• {f.title}{f.severity ? " (" + f.severity + ")" : ""}{f.uncertainty ? " — uncertainty: " + f.uncertainty : ""}</Text>)}
          {p.narrative?.recommendations ? <><Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6 }}>Recommendations</Text><Text style={{ fontSize: 11, color: "#334155" }}>{p.narrative.recommendations}</Text></> : null}
          {p.materials?.length ? <><Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6 }}>Materials</Text>{p.materials.map((m, i) => <Text key={i} style={{ fontSize: 11, color: "#334155" }}>• {m.description} — {m.quantity} {m.unit}{m.provisional ? " (provisional)" : ""}</Text>)}</> : null}
          <Text style={{ fontWeight: "700", fontSize: 12, marginTop: 6 }}>Limitations</Text>
          {p.limitations.length === 0 ? <Text style={{ fontSize: 11, color: "#64748b" }}>None stated</Text> : p.limitations.map((l, i) => <Text key={i} style={{ fontSize: 11, color: "#334155" }}>• {l}</Text>)}
          <Text style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>Not a certification. AI-generated content is a draft that a qualified person must verify.</Text>
        </View>
      ) : null}

      {draft && canWrite ? (
        <View style={[card, { gap: 10 }]}>
          <Text style={{ fontWeight: "700", fontSize: 13, color: "#0f172a" }}>Edit this draft</Text>
          {([["summary", "Summary"], ["recommendations", "Recommendations"], ["notes", "Reviewer notes"]] as const).map(([k, label]) => (
            <View key={k} style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#0f172a" }}>{label}</Text>
              <TextInput multiline value={narrative[k] ?? ""} onChangeText={(t) => setNarrative((n) => ({ ...n, [k]: t }))} maxLength={5000} style={input} />
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable onPress={saveNarrative} disabled={busy !== null} style={btn(false, busy !== null)}><Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>{busy === "save" ? "Saving…" : "Save edits"}</Text></Pressable>
            <Pressable onPress={finalize} disabled={busy !== null} style={[btn(true, busy !== null), { backgroundColor: busy !== null ? "#94a3b8" : "#f59e0b" }]}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{busy === "finalize" ? "Finalizing…" : "Sign off & finalize"}</Text></Pressable>
          </View>
          <Text style={{ fontSize: 10, color: "#94a3b8" }}>Finalizing is refused while the completeness review has blockers, or if the assessment changed after this draft was created.</Text>
        </View>
      ) : null}

      {selected ? (
        <Pressable onPress={downloadPdf} disabled={busy !== null} style={btn(false, busy !== null)}><Text style={{ fontWeight: "700", fontSize: 12, color: "#0f172a" }}>{busy === "pdf" ? "Generating…" : "Download PDF of this version"}</Text></Pressable>
      ) : null}
    </ScrollView>
  );
}
