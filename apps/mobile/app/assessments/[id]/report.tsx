import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { NARRATIVE_SECTIONS, type NarrativeTextKey, checklistGlance, downloadGate, glanceSentence, groupByCategory, hasWriteUp, keyFindingsFor, photoNumbers, recommendedActions, reportLayout, siteBriefLines, statusLabel, PRIORITY_LABEL, type ReportInput, type ReportKeyFinding, type ReportNarrative } from "@eval-ai/shared";
import { KeyFindingView, KeyFindingsEditorMobile } from "../../../components/KeyFindingsMobile";
import { DesignViewMobile } from "../../../components/DesignViewMobile";
import { SolarViewMobile } from "../../../components/SolarViewMobile";
import { apiFetch, apiBase } from "../../../lib/api";
import { useRole } from "../../../lib/role";
import { downloadReportPdf } from "../../../lib/reportDownload";
import { previewedKeyFor } from "../../../lib/reportPreviewState";
import { ReportPhotoChoices, type ChoicePhoto } from "../../../components/ReportPhotoChoices";
import { colors, radius, space } from "../../../lib/theme";
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
type Narrative = ReportNarrative;

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
  const { id, prepare } = useLocalSearchParams<{ id: string; prepare?: string }>();
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
      const res = await apiFetch("/api/reports/snapshot?light=1&assessmentId=" + jobId);
      const data = (await res.json().catch(() => ({}))) as { snapshots?: Snap[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load reports");
      const list = data.snapshots ?? [];
      setSnaps(list);
      setFullIds([]); // the fresh list is the light one again; the shown version's pictures are fetched again
      setSelectedId((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  // The list leaves out the report photos' pictures (they are large); fetch them for the version being shown.
  const [fullIds, setFullIds] = useState<string[]>([]);
  useEffect(() => {
    const cur = snaps.find((s) => s.id === selectedId) as (Snap & { light?: boolean }) | undefined;
    if (!cur || !cur.light || !cur.payload?.photos?.length || fullIds.includes(cur.id)) return;
    let live = true;
    (async () => {
      try {
        const res = await apiFetch("/api/reports/snapshot?snapshotId=" + cur.id);
        const data = (await res.json().catch(() => ({}))) as { snapshot?: Snap };
        if (live && res.ok && data.snapshot) {
          setSnaps((prev) => prev.map((s) => (s.id === cur.id ? data.snapshot! : s)));
          setFullIds((ids) => [...ids, cur.id]);
        }
      } catch {
        /* the text of the photos is still shown without the pictures */
      }
    })();
    return () => { live = false; };
  }, [snaps, selectedId, fullIds]);
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

  // "Prepare my report" (D-022): the AI looks at the photos, the draft is built from photos + answers + findings, and the AI
  // drafts the summary. Each step may fail without stopping the next; what failed is listed under the report.
  type Step = "photos" | "choose" | "draft" | "summary";
  const router = useRouter();
  const [preparing, setPreparing] = useState<Step | null>(null);
  // "Choose photos for the report" (D-024): the preparation waits here until every photo is answered.
  const [choicePhotos, setChoicePhotos] = useState<ChoicePhoto[] | null>(null);
  const [choiceSaving, setChoiceSaving] = useState(false);
  const chooseDone = useRef<((answered: boolean) => void) | null>(null);
  const [, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => { setFocusTick((t) => t + 1); }, []));
  const [stepsDone, setStepsDone] = useState<Step[]>([]);
  const [prepNotes, setPrepNotes] = useState<string[]>([]);
  const [issueDone, setIssueDone] = useState<Record<string, boolean>>({});

  const submitChoices = async (choices: Record<string, boolean>) => {
    setChoiceSaving(true);
    try {
      await post("/api/reports/photo-choices", { assessmentId: jobId, choices });
      setChoicePhotos(null);
      chooseDone.current?.(true);
      chooseDone.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChoiceSaving(false);
    }
  };
  const cancelChoices = () => {
    setChoicePhotos(null);
    chooseDone.current?.(false);
    chooseDone.current = null;
  };
  /** Reopen the choices at any time; saving them rebuilds the report so the new answers apply. */
  const changeChoices = () => run("choices", async () => {
    const res = await apiFetch("/api/ai/report-photos?assessmentId=" + jobId);
    const data = (await res.json().catch(() => ({}))) as { photos?: ChoicePhoto[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not load the photos");
    if (!data.photos?.length) throw new Error("No photos have been looked at yet. Use Prepare my report first.");
    chooseDone.current = (answered) => { if (answered) void prepareReport(); };
    setChoicePhotos(data.photos);
  });

  const prepareReport = async () => {
    setError(null);
    setPrepNotes([]);
    setStepsDone([]);
    const notes: string[] = [];
    try {
      apiBase();
      setPreparing("photos");
      try {
        const r = (await post("/api/ai/report-photos", { assessmentId: jobId })) as { analyzed?: number; cached?: number; skipped?: number; failed?: string[] };
        if ((r.skipped ?? 0) > 0) notes.push((r.skipped ?? 0) + " photo(s) were left out because a report holds at most 12.");
        if ((r.failed?.length ?? 0) > 0) notes.push((r.failed?.length ?? 0) + " photo(s) couldn't be analysed and are not described in the report.");
      } catch (e) {
        notes.push("The photos were not analysed: " + (e instanceof Error ? e.message : String(e)));
      }
      setStepsDone((s) => [...s, "photos"]);

      // The person decides which photos go in the report. Only photos still waiting for an answer are asked about.
      setPreparing("choose");
      try {
        const res = await apiFetch("/api/ai/report-photos?assessmentId=" + jobId);
        const data = (await res.json().catch(() => ({}))) as { photos?: ChoicePhoto[] };
        const photos = res.ok ? data.photos ?? [] : [];
        if (photos.some((p) => p.choice === null)) {
          const answered = await new Promise<boolean>((resolve) => {
            chooseDone.current = resolve;
            setChoicePhotos(photos);
          });
          if (!answered) {
            notes.push("The report was not prepared because the photo choices were cancelled. Prepare it again when you are ready.");
            return;
          }
        }
      } catch (e) {
        notes.push("The photo choices could not be loaded, so no photos were added: " + (e instanceof Error ? e.message : String(e)));
      }
      setStepsDone((s) => [...s, "choose"]);

      setPreparing("draft");
      // Outline the possible issues on the added photos (D-041). The draft is still made if this fails.
      try {
        for (let i = 0; i < 4; i++) {
          const m = (await post("/api/ai/photo-highlights", { assessmentId: jobId })) as { done?: number; remaining?: number };
          if (!m.remaining || !m.done) break;
        }
      } catch (e) {
        notes.push("The photos could not be marked: " + (e instanceof Error ? e.message : String(e)));
      }
      const d = (await post("/api/reports/snapshot", { assessmentId: jobId, includeMaterials })) as { snapshot?: Snap; picturesMissing?: number };
      if (!d.snapshot) throw new Error("The report draft could not be created");
      if (d.picturesMissing) notes.push(d.picturesMissing + " photo(s) could not be added as pictures, so they show text only. Create the draft again to retry.");
      setStepsDone((s) => [...s, "draft"]);

      setPreparing("summary");
      try {
        type Drafted = ReportNarrative & { unverifiedFigures?: string[]; droppedFindings?: string[]; continueWith?: "designWrite" };
        let t = (await post("/api/ai/report-draft", { assessmentId: jobId, snapshotId: d.snapshot.id })) as Drafted;
        // A design proposal comes in two steps (D-034): the camera plan, then the write-up around it. If the write-up fails, the plan is kept.
        if (t.continueWith === "designWrite" && (t.design || t.solar)) {
          const plan = t;
          try {
            t = (await post("/api/ai/report-draft", { assessmentId: jobId, snapshotId: d.snapshot.id, stage: "designWrite", ...(plan.design ? { design: plan.design } : { solar: plan.solar }) })) as Drafted;
          } catch (e) {
            notes.push("The design plan was drafted, but the summary, options, equipment and open items were not: " + (e instanceof Error ? e.message : String(e)) + " You can redraft them on the web report screen.");
          }
        }
        // The key findings (or, for a new CCTV installation, the design proposal, D-034), summary, site overview and open items the AI
        // drafted; extra recommendations and reviewer notes stay the person's own.
        const text: ReportNarrative = { keyFindings: t.keyFindings ?? [], ...(t.design ? { design: t.design } : {}), ...(t.solar ? { solar: t.solar } : {}) };
        for (const k of ["summary", "siteOverview", "openItems"] as const) if (typeof t[k] === "string" && t[k]!.trim()) text[k] = t[k];
        await post("/api/reports/snapshot", { snapshotId: d.snapshot.id, narrative: text }, "PATCH");
        // The review runs last because it reads the saved write-up. If it fails, the standard project plan stays in the draft (D-039).
        try {
          const r = (await post("/api/ai/report-draft", { assessmentId: jobId, snapshotId: d.snapshot.id, stage: "plan" })) as { projectPlan?: ReportNarrative["projectPlan"]; droppedHolds?: string[] };
          if (r.projectPlan) await post("/api/reports/snapshot", { snapshotId: d.snapshot.id, narrative: { projectPlan: r.projectPlan } }, "PATCH");
          const droppedHolds = (r.droppedHolds ?? []).filter(Boolean);
          if (droppedHolds.length > 0) notes.push("Points the AI review raised but that were left out (no source in your record): " + droppedHolds.join("; ") + ".");
        } catch (e) {
          notes.push("The AI review did not finish, so the draft has the standard project plan: " + (e instanceof Error ? e.message : String(e)));
        }
        const figures = (t.unverifiedFigures ?? []).filter(Boolean);
        if (figures.length > 0) notes.push("Check these figures before relying on them — they are not in your saved data: " + figures.join("; ") + ".");
        const dropped = (t.droppedFindings ?? []).filter(Boolean);
        if (dropped.length > 0) notes.push("Findings the AI wrote but that were left out (incomplete, or no source in your record): " + dropped.join("; ") + ".");
      } catch (e) {
        notes.push("The written sections were not drafted: " + (e instanceof Error ? e.message : String(e)) + " The report still has all your saved facts, and you can write the sections yourself below.");
      }
      setStepsDone((s) => [...s, "summary"]);
      await load();
      setSelectedId(d.snapshot.id);
      // Straight to the finished document: look at it before anything is downloaded.
      router.push(`/assessments/${jobId}/report-preview?snapshotId=${d.snapshot.id}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(null);
      setPrepNotes(notes);
    }
  };

  // Opened from "Preview report" on the job: start preparing straight away (once, and only for people who can write).
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (prepare === "1" && loaded && canWrite && !autoStarted && !loading) {
      setAutoStarted(true);
      void prepareReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepare, loaded, canWrite, loading, autoStarted]);

  const removePhoto = (evidenceId: string) => run("photo", async () => {
    if (!selected) return;
    await post("/api/reports/snapshot", { snapshotId: selected.id, removePhotos: [evidenceId] }, "PATCH");
    await load();
  });

  const issueToFinding = (key: string, text: string, evidenceId: string) => run("issue", async () => {
    await post("/api/findings", {
      assessmentId: jobId,
      title: text.slice(0, 120),
      description: text + " (Seen in a photo and suggested by an AI. Needs a person's review.)",
      evidenceRefs: [evidenceId],
    });
    setIssueDone((m) => ({ ...m, [key]: true }));
  });

  const saveNarrative = () => run("save", async () => {
    if (!selected) return;
    await post("/api/reports/snapshot", { snapshotId: selected.id, narrative }, "PATCH");
    await load();
  });

  /** Rewrite only the summary and open items from the findings as they are now (the person's edits are saved first, so the AI reads them). */
  const rewriteSummary = () => run("summary", async () => {
    if (!selected) return;
    await post("/api/reports/snapshot", { snapshotId: selected.id, narrative: { keyFindings: narrative.keyFindings ?? [] } }, "PATCH");
    const t = (await post("/api/ai/report-draft", { assessmentId: jobId, snapshotId: selected.id, stage: "summary" })) as { summary?: string; openItems?: string; unverifiedFigures?: string[] };
    setNarrative((n) => ({ ...n, summary: t.summary ?? n.summary, openItems: t.openItems ?? n.openItems }));
    const figures = (t.unverifiedFigures ?? []).filter(Boolean);
    Alert.alert("Rewritten", "The summary and open items now follow your findings. Read them, then Save edits." + (figures.length ? "\n\nCheck these figures: " + figures.join("; ") + "." : ""));
    await load();
  });

  /** One labelled text box for a written section. */
  const textField = (key: NarrativeTextKey) => {
    const s = NARRATIVE_SECTIONS.find((x) => x.key === key)!;
    return <Field key={key} label={s.label} multiline value={narrative[key] ?? ""} onChangeText={(t) => setNarrative((n) => ({ ...n, [key]: t }))} maxLength={s.max} />;
  };

  const finalize = () => {
    if (!selected) return;
    const bare = !hasWriteUp(selected.payload?.narrative, selected.payload?.findings?.length);
    Alert.alert(
      "Sign off and finalize?",
      (bare ? "This report has no summary or findings, only the saved facts. A client could read that as an all-clear. " : "") + "You're confirming you've read this report and checked its findings, measurements and recommendations against the evidence. This version will be locked and you'll be recorded as the reviewer.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign off", style: "destructive", onPress: () => void run("finalize", async () => { await post("/api/reports/finalize", { snapshotId: selected.id, confirmReviewed: true, ...(bare ? { acceptNoWriteUp: true } : {}) }); await load(); }) },
      ],
    );
  };

  const gate = downloadGate(selected ? { id: selected.id, finalized: selected.finalized, payload: selected.payload } : null, selected ? previewedKeyFor(selected.id) : null);
  const openPreview = () => { if (selected) router.push(`/assessments/${jobId}/report-preview?snapshotId=${selected.id}` as never); };
  const downloadPdf = () => run("pdf", async () => {
    // Drafts can only be downloaded after they were previewed in their current form (D-024).
    if (!selected || gate.locked) return;
    await downloadReportPdf(selected.id);
  });

  if (loading) return <Screen><Stack.Screen options={{ title: "Report" }} /><Loading label="Loading report…" variant="card" rows={5} /></Screen>;
  const p = selected?.payload;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Report" }} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loaded && !canWrite ? <Banner tone="neutral" message="You have view-only access — you can read and download reports." /> : null}

      {canWrite ? (
        <Card>
          <SectionHeader title="Prepare my report" subtitle="The AI looks at your photos, then writes a draft from the photos, your checklist answers, findings and measurements. You check and sign it off." />
          {preparing || stepsDone.length > 0 ? (
            <View style={{ gap: 4 }}>
              {([["photos", "Looking at your photos"], ["choose", "Choosing photos for the report"], ["draft", "Building the report"], ["summary", "Writing the report"]] as Array<[Step, string]>).map(([k, label]) => (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name={stepsDone.includes(k) ? "checkmark-circle" : preparing === k ? "time-outline" : "ellipse-outline"} size={18} color={stepsDone.includes(k) ? colors.success : preparing === k ? colors.accent : colors.textSubtle} />
                  <Text variant="body" color={stepsDone.includes(k) || preparing === k ? colors.text : colors.textSubtle}>{label}{preparing === k ? "…" : ""}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {choicePhotos ? <ReportPhotoChoices photos={choicePhotos} saving={choiceSaving} onSubmit={(c) => void submitChoices(c)} onCancel={cancelChoices} /> : null}
          {!choicePhotos && !preparing && snaps.length > 0 ? <Button title="Change my photo choices" icon="images-outline" variant="ghost" size="sm" onPress={() => void changeChoices()} disabled={busy !== null} /> : null}
          <Button title={preparing ? "Working…" : snaps.length ? "Rebuild with the latest photos and answers" : "Prepare my report"} icon="sparkles-outline" variant="accent" onPress={() => void prepareReport()} loading={!!preparing} disabled={busy !== null || !!preparing} />
          {preparing ? <Text variant="caption">This can take up to a minute with many photos. Keep this screen open.</Text> : null}
          {prepNotes.map((n, i) => <Banner key={i} tone="warning" message={n} />)}
        </Card>
      ) : null}

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
            <Button title={preparing ? "Working…" : "Create new draft"} icon="add" variant="accent" onPress={() => void prepareReport()} loading={!!preparing} disabled={busy !== null || !!preparing} />
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

          {reportLayout(p) === "solar" && p.narrative?.solar ? (
            <>
              <ReportSection title="Site and scope">
                {p.narrative.siteOverview ? <Text variant="caption" color={colors.text}>{p.narrative.siteOverview}</Text> : null}
                {siteBriefLines(p.siteBrief, p.context?.goal ?? p.context?.scope).map((l) => <Bullet key={l.label}>{l.label}: {l.value}</Bullet>)}
              </ReportSection>
              <ReportSection title="Solar design and sizing">
                <SolarViewMobile design={p.narrative.solar} />
              </ReportSection>
            </>
          ) : reportLayout(p) === "design" && p.narrative?.design ? (
            <>
              <ReportSection title="Site and scope">
                {p.narrative.siteOverview ? <Text variant="caption" color={colors.text}>{p.narrative.siteOverview}</Text> : null}
                {siteBriefLines(p.siteBrief, p.context?.goal ?? p.context?.scope).map((l) => <Bullet key={l.label}>{l.label}: {l.value}</Bullet>)}
              </ReportSection>
              <ReportSection title="Design proposal">
                <DesignViewMobile design={p.narrative.design} />
              </ReportSection>
            </>
          ) : reportLayout(p) === "findings" ? (
            <>
              <Text variant="caption" color={colors.textMuted}>At a glance: {glanceSentence(checklistGlance(p.checklist))}</Text>
              <ReportSection title="Site and scope">
                {p.narrative?.siteOverview ? <Text variant="caption" color={colors.text}>{p.narrative.siteOverview}</Text> : null}
                {siteBriefLines(p.siteBrief, p.context?.goal ?? p.context?.scope).map((l) => <Bullet key={l.label}>{l.label}: {l.value}</Bullet>)}
                {p.siteBrief?.interview && (p.siteBrief.interview.details.length > 0 || p.siteBrief.interview.statements.length > 0) ? (
                  <>
                    <Text variant="caption" color={colors.textMuted}>Site interview: what the person said, not verified facts</Text>
                    {p.siteBrief.interview.details.map((d, i) => <Bullet key={"id" + i}>{d.label}: {d.value}</Bullet>)}
                    {p.siteBrief.interview.statements.map((x, i) => <Bullet key={"is" + i}>{x.question} {x.answer}</Bullet>)}
                  </>
                ) : null}
              </ReportSection>
              <ReportSection title="Key findings">
                {keyFindingsFor(p).length === 0 ? <Bullet muted>No findings, issues or items needing attention were recorded</Bullet> : null}
                {keyFindingsFor(p).map((f, i) => <KeyFindingView key={f.id} finding={f} index={i + 1} photoNumber={photoNumbers(p)} />)}
              </ReportSection>
              {recommendedActions(keyFindingsFor(p)).length > 0 ? (
                <ReportSection title="Recommended actions">
                  {recommendedActions(keyFindingsFor(p)).map((a) => <Bullet key={a.id}>[{PRIORITY_LABEL[a.priority]}] {a.title}. {a.action}</Bullet>)}
                </ReportSection>
              ) : null}
              {p.narrative?.recommendations ? <ReportSection title="Additional recommendations"><Text variant="caption" color={colors.text}>{p.narrative.recommendations}</Text></ReportSection> : null}
            </>
          ) : (
            <>
              <ReportSection title="At a glance">
                <Text variant="caption" color={colors.text}>{glanceSentence(checklistGlance(p.checklist))}</Text>
                {checklistGlance(p.checklist).requiredOpen.map((c, i) => <Bullet key={i}>Still to check (required): {c.title}</Bullet>)}
              </ReportSection>
              <ReportSection title="Site and scope">
                {p.narrative?.siteOverview ? <Text variant="caption" color={colors.text}>{p.narrative.siteOverview}</Text> : null}
                {siteBriefLines(p.siteBrief, p.context?.goal ?? p.context?.scope).map((l) => <Bullet key={l.label}>{l.label}: {l.value}</Bullet>)}
                {p.siteBrief?.interview && (p.siteBrief.interview.details.length > 0 || p.siteBrief.interview.statements.length > 0) ? (
                  <>
                    <Text variant="caption" color={colors.textMuted}>Site interview: what the person said, not verified facts</Text>
                    {p.siteBrief.interview.details.map((d, i) => <Bullet key={"id" + i}>{d.label}: {d.value}</Bullet>)}
                    {p.siteBrief.interview.statements.map((x, i) => <Bullet key={"is" + i}>{x.question} {x.answer}</Bullet>)}
                  </>
                ) : null}
              </ReportSection>
              <ReportSection title="What was found, by area">
                {p.narrative?.observations ? (
                  <Text variant="caption" color={colors.text}>{p.narrative.observations}</Text>
                ) : (
                  groupByCategory(p.checklist.filter((c) => c.status !== "not_checked")).map((g) => (
                    <View key={g.category} style={{ gap: 2 }}>
                      <Text variant="label" color={colors.text}>{g.category}</Text>
                      {g.rows.map((c, i) => <Bullet key={i}>{c.title} — {statusLabel(c.status)}{c.notes ? ` — ${c.notes}` : ""}</Bullet>)}
                    </View>
                  ))
                )}
              </ReportSection>
              <ReportSection title="Issues and risks">
                {p.narrative?.issues ? <Text variant="caption" color={colors.text}>{p.narrative.issues}</Text> : null}
                {p.findings.length === 0 ? <Bullet muted>No confirmed findings</Bullet> : p.findings.map((f, i) => <Bullet key={i}>{f.title}{f.severity ? ` (${f.severity})` : ""}{f.uncertainty ? ` — uncertain: ${f.uncertainty}` : ""}</Bullet>)}
                {checklistGlance(p.checklist).flagged.map((c, i) => <Bullet key={"f" + i}>{c.title} — {statusLabel(c.status)}{c.notes ? ` — ${c.notes}` : ""}</Bullet>)}
              </ReportSection>
              {p.narrative?.recommendations ? <ReportSection title="Recommended next steps"><Text variant="caption" color={colors.text}>{p.narrative.recommendations}</Text></ReportSection> : null}
            </>
          )}
          {p.photos?.length ? (
            <ReportSection title="Photos and what was seen">
              <Text variant="caption" color={colors.textMuted}>Written by an AI from each photo. Not verified, and not findings or measurements.</Text>
              {p.photos.map((ph, i) => (
                <View key={ph.evidenceId} style={{ gap: 4, paddingVertical: space.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text variant="bodyStrong">Photo {i + 1}</Text>
                    {ph.itemTitle ? <Text variant="caption" style={{ flex: 1 }}>{ph.itemTitle}</Text> : null}
                    <Badge label="AI description — not verified" tone="warning" />
                  </View>
                  {ph.thumbnail ? <Image source={{ uri: ph.thumbnail }} style={{ width: "100%", height: 190, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} resizeMode="contain" /> : null}
                  {ph.caption ? <Text variant="body">{ph.caption}</Text> : null}
                  {ph.observations.map((o, j) => <Bullet key={j}>{o}</Bullet>)}
                  {ph.cannotTell.length ? <Text variant="caption" color={colors.textMuted}>Can't be told from this photo: {ph.cannotTell.join("; ")}</Text> : null}
                  {draft && canWrite ? <Button title="Remove from report" icon="trash-outline" variant="ghost" size="sm" onPress={() => void removePhoto(ph.evidenceId)} disabled={busy !== null} /> : null}
                </View>
              ))}
            </ReportSection>
          ) : null}
          {p.photos?.some((ph) => ph.possibleIssues.length > 0) ? (
            <ReportSection title="Possible issues seen in photos (AI, not verified)">
              <Text variant="caption" color={colors.textMuted}>Things an AI noticed that a person should check. They are not confirmed findings and are not in the findings above.</Text>
              {p.photos.flatMap((ph, i) =>
                ph.possibleIssues.map((x, j) => {
                  const key = ph.evidenceId + ":" + j;
                  return (
                    <View key={key} style={{ gap: 4, paddingVertical: 4 }}>
                      <Bullet>{x.text} (Photo {i + 1}, {x.confidence === "high" ? "likely" : x.confidence === "medium" ? "possible" : "unclear"})</Bullet>
                      {draft && canWrite ? (
                        issueDone[key] ? <Badge label="Added as a finding draft" tone="success" /> : <Button title="Make finding draft" icon="flag-outline" variant="secondary" size="sm" onPress={() => void issueToFinding(key, x.text, ph.evidenceId)} disabled={busy !== null} />
                      ) : null}
                    </View>
                  );
                }),
              )}
            </ReportSection>
          ) : null}
          {p.materials?.length ? (
            <ReportSection title="Materials">
              {p.materials.map((m, i) => <Bullet key={i}>{m.description}{m.source === "ai_suggested" ? " [AI suggestion]" : ""} — {m.quantityTbd ? "TBD" : `${m.quantity} ${m.unit}`}{m.provisional || m.quantityTbd ? " (provisional)" : ""}{m.specification ? ` — ${m.specification}` : ""}</Bullet>)}
            </ReportSection>
          ) : null}
          <ReportSection title="Open items and limitations">
            {p.narrative?.openItems ? <Text variant="caption" color={colors.text}>{p.narrative.openItems}</Text> : null}
            {p.limitations.length === 0 ? <Bullet muted>None stated</Bullet> : p.limitations.map((l, i) => <Bullet key={i}>{l}</Bullet>)}
          </ReportSection>
          <ReportSection title="Checklist results">
            {groupByCategory(p.checklist).map((g) => (
              <View key={g.category} style={{ gap: 2 }}>
                <Text variant="label" color={colors.text}>{g.category}</Text>
                {g.rows.map((c, i) => <Bullet key={i}>{c.title} — {statusLabel(c.status)}{c.notes ? ` — ${c.notes}` : ""}{c.measured ? ` — measured ${c.measured.value} ${c.measured.unit}` : ""}</Bullet>)}
              </View>
            ))}
          </ReportSection>
          <ReportSection title="Measurements">
            {p.measurements.length === 0 ? <Bullet muted>None recorded</Bullet> : p.measurements.map((m, i) => <Bullet key={i}>{m.name}: {m.value} {m.unit}</Bullet>)}
          </ReportSection>
          {p.narrative?.notes ? <ReportSection title="Reviewer notes"><Text variant="caption" color={colors.text}>{p.narrative.notes}</Text></ReportSection> : null}
          <Text style={{ fontSize: 11, color: colors.textSubtle }}>Not a certification. Anything AI-drafted must be checked by a qualified person.</Text>
        </Card>
      ) : null}

      {draft && canWrite ? (
        <Card style={{ gap: space.lg }}>
          <SectionHeader title="Edit this draft" />
          {/* Summary and site first, then the findings the report is built around, then the extras. Older free-text sections only show when they hold text. */}
          {(["summary", "siteOverview"] as const).map((k) => textField(k))}
          {narrative.design || narrative.solar ? (
            <Text variant="caption">This report is a design proposal. Edit the {narrative.solar ? "loads, sizing inputs" : "cameras, decisions"} and open items on the web report screen.</Text>
          ) : (
            <KeyFindingsEditorMobile value={narrative.keyFindings ?? []} onChange={(keyFindings) => setNarrative((n) => ({ ...n, keyFindings }))} photoNumber={photoNumbers({ photos: selected?.payload?.photos })} />
          )}
          {(["recommendations", "openItems", "notes"] as const).map((k) => textField(k))}
          {NARRATIVE_SECTIONS.filter((s) => s.legacy && narrative[s.key]?.trim()).map((s) => textField(s.key))}
          {narrative.design || narrative.solar ? null : <Button title={busy === "summary" ? "Writing…" : "Rewrite summary from my findings"} icon="sparkles-outline" variant="secondary" onPress={rewriteSummary} loading={busy === "summary"} disabled={busy !== null} />}
          <Button title={busy === "save" ? "Saving…" : "Save edits"} icon="save-outline" variant="secondary" onPress={saveNarrative} loading={busy === "save"} disabled={busy !== null} />
          <Button title={busy === "finalize" ? "Finalizing…" : "Sign off & finalize"} icon="shield-checkmark-outline" variant="primary" onPress={finalize} loading={busy === "finalize"} disabled={busy !== null} />
          <Text variant="caption">You can't finalize while the progress check shows anything that must be fixed, or if the job changed after this draft was created.</Text>
        </Card>
      ) : null}

      {selected ? (
        <View style={{ gap: space.sm }}>
          <Button title="Preview the report" icon="eye-outline" variant="accent" onPress={openPreview} disabled={busy !== null} />
          <Button title={busy === "pdf" ? "Generating…" : "Download PDF"} icon="download-outline" variant="secondary" onPress={downloadPdf} loading={busy === "pdf"} disabled={busy !== null || gate.locked} />
          {gate.locked && gate.reason ? <Text variant="caption">{gate.reason}</Text> : null}
        </View>
      ) : null}
    </Screen>
  );
}
