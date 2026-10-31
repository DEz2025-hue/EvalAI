import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import type { ReportInput } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";
import { useRole } from "../../../lib/role";
import { checkStatus, colors, radius, space } from "../../../lib/theme";
import { Badge, Banner, Button, Card, EmptyState, Field, Icon, Loading, Screen, SectionHeader, Text } from "../../../components/ui";

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

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
      <Text variant="overline">{title}</Text>
      {children}
    </View>
  );
}

const Bullet = ({ children, muted }: { children: ReactNode; muted?: boolean }) => <Text variant="caption" color={muted ? colors.textMuted : colors.text}>• {children}</Text>;

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
      "You're confirming you've read this report and checked its findings, measurements and recommendations against the evidence. This version will be locked and you'll be recorded as the reviewer.",
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
    else Alert.alert("PDF ready", "The PDF was created, but it can't be downloaded on this device right now. Open this report on the web to download it.");
  });

  if (loading) return <Screen><Stack.Screen options={{ title: "Report" }} /><Loading label="Loading report…" /></Screen>;
  const p = selected?.payload;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Report" }} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loaded && !canWrite ? <Banner tone="neutral" message="You have view-only access — you can read and download reports." /> : null}

      <Card>
        <SectionHeader title="Versions" subtitle={snaps.length ? "Newest first — tap one to open it." : undefined} />
        {snaps.length === 0 ? <EmptyState icon="document-text-outline" title="No report yet" message="Create a draft from what's been recorded, then edit, review and sign it off." /> : null}
        {snaps.map((s) => {
          const on = s.id === selectedId;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSelectedId(s.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.sm, borderWidth: on ? 2 : 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }}
            >
              <Icon name={s.finalized ? "lock-closed" : "create-outline"} size={16} color={s.finalized ? colors.success : colors.warning} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Version {s.assessmentVersion}</Text>
                <Text variant="caption">{new Date(s.createdAt).toLocaleString()}{s.materialsVersion ? ` · materials v${s.materialsVersion}` : ""}</Text>
              </View>
              <Badge label={s.finalized ? "Final" : "Draft"} tone={s.finalized ? "success" : "warning"} />
            </Pressable>
          );
        })}
        {canWrite ? (
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <Pressable onPress={() => setIncludeMaterials((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: includeMaterials }} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs }}>
              <Icon name={includeMaterials ? "checkbox" : "square-outline"} size={20} color={includeMaterials ? colors.accent : colors.textMuted} />
              <Text variant="body">Include materials list</Text>
            </Pressable>
            <Button title={busy === "create" ? "Creating…" : "Create new draft"} icon="add" variant="accent" onPress={createDraft} loading={busy === "create"} disabled={busy !== null} />
          </View>
        ) : null}
      </Card>

      {selected && p ? (
        <Card>
          <View style={{ gap: space.xs }}>
            <Text variant="title">{p.siteName}</Text>
            {selected.finalized ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="shield-checkmark" size={14} color={colors.success} />
                <Text variant="caption" color={colors.success} style={{ flex: 1 }}>
                  Finalized{selected.reviewedByLabel ? ` · signed off by ${selected.reviewedByLabel}` : ""}{selected.reviewedAt ? ` on ${new Date(selected.reviewedAt).toLocaleDateString()}` : ""}
                </Text>
              </View>
            ) : (
              <Badge label="Draft — not yet signed off" tone="warning" />
            )}
            {selected.reviewNote ? <Text variant="caption">Note: {selected.reviewNote}</Text> : null}
          </View>

          {p.narrative?.summary ? <Text variant="body">{p.narrative.summary}</Text> : null}

          <ReportSection title="Checklist">
            {p.checklist.map((c, i) => <Bullet key={i}>{c.title} — {checkStatus(c.status).label}{c.notes ? ` — ${c.notes}` : ""}</Bullet>)}
          </ReportSection>
          <ReportSection title="Measurements">
            {p.measurements.length === 0 ? <Bullet muted>None recorded</Bullet> : p.measurements.map((m, i) => <Bullet key={i}>{m.name}: {m.value} {m.unit}</Bullet>)}
          </ReportSection>
          <ReportSection title="Findings">
            {p.findings.length === 0 ? <Bullet muted>No confirmed findings</Bullet> : p.findings.map((f, i) => <Bullet key={i}>{f.title}{f.severity ? ` (${f.severity})` : ""}{f.uncertainty ? ` — uncertain: ${f.uncertainty}` : ""}</Bullet>)}
          </ReportSection>
          {p.narrative?.recommendations ? <ReportSection title="Recommendations"><Text variant="caption" color={colors.text}>{p.narrative.recommendations}</Text></ReportSection> : null}
          {p.materials?.length ? (
            <ReportSection title="Materials">
              {p.materials.map((m, i) => <Bullet key={i}>{m.description} — {m.quantity} {m.unit}{m.provisional ? " (provisional)" : ""}</Bullet>)}
            </ReportSection>
          ) : null}
          <ReportSection title="Limitations">
            {p.limitations.length === 0 ? <Bullet muted>None stated</Bullet> : p.limitations.map((l, i) => <Bullet key={i}>{l}</Bullet>)}
          </ReportSection>
          <Text style={{ fontSize: 11, color: colors.textSubtle }}>Not a certification. Anything AI-drafted must be checked by a qualified person.</Text>
        </Card>
      ) : null}

      {draft && canWrite ? (
        <Card style={{ gap: space.lg }}>
          <SectionHeader title="Edit this draft" />
          <Field label="Summary" multiline value={narrative.summary ?? ""} onChangeText={(t) => setNarrative((n) => ({ ...n, summary: t }))} maxLength={5000} />
          <Field label="Recommendations" multiline value={narrative.recommendations ?? ""} onChangeText={(t) => setNarrative((n) => ({ ...n, recommendations: t }))} maxLength={5000} />
          <Field label="Reviewer notes" multiline value={narrative.notes ?? ""} onChangeText={(t) => setNarrative((n) => ({ ...n, notes: t }))} maxLength={5000} />
          <Button title={busy === "save" ? "Saving…" : "Save edits"} icon="save-outline" variant="secondary" onPress={saveNarrative} loading={busy === "save"} disabled={busy !== null} />
          <Button title={busy === "finalize" ? "Finalizing…" : "Sign off & finalize"} icon="shield-checkmark-outline" variant="primary" onPress={finalize} loading={busy === "finalize"} disabled={busy !== null} />
          <Text variant="caption">You can't finalize while the progress check shows anything that must be fixed, or if the job changed after this draft was created.</Text>
        </Card>
      ) : null}

      {selected ? (
        <Button title={busy === "pdf" ? "Generating…" : "Download PDF"} icon="download-outline" variant="secondary" onPress={downloadPdf} loading={busy === "pdf"} disabled={busy !== null} />
      ) : null}
    </Screen>
  );
}
