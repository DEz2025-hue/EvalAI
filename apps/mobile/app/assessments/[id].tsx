import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { SCENARIO_LIST, scenarioFor, scenarioLabel, startHereFor, type IntakeSummary, type Scenario } from "@eval-ai/shared";
import { useLocalSearchParams, Link, Stack, useFocusEffect, useRouter } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { apiFetch, apiBase } from "../../lib/api";
import { useRole } from "../../lib/role";
import { capitalize, siteNameOf, timeAgo } from "../../lib/format";
import { systemIcon, systemLabel } from "../../lib/packs";
import { colors, radius, space, statusTone, tones } from "../../lib/theme";
import { ChecklistSummaryMobile } from "../../components/ChecklistSummaryMobile";
import { FieldCaptureMobile } from "../../components/FieldCaptureMobile";
import { MeasurementsPanelMobile } from "../../components/MeasurementsPanelMobile";
import { AiDraftPanelMobile } from "../../components/AiDraftPanelMobile";
import { Banner, Button, Card, EmptyState, ErrorState, Field, Icon, Loading, NavTile, Screen, SectionHeader, Text } from "../../components/ui";
import type { AssessmentRow } from "../../lib/types";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; row: AssessmentRow };

export default function AssessmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [storedItems, setStoredItems] = useState<Array<{ id: string; title: string; required: boolean; category?: string }> | null>(null);
  const [storedResponses, setStoredResponses] = useState<Array<{ itemId: string; status: string }>>([]);
  const [itemsState, setItemsState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [itemsTick, setItemsTick] = useState(0);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const readyId = state.kind === "ready" ? state.row.id : null;
  const [settingScenario, setSettingScenario] = useState(false);
  const router = useRouter();
  const { isAdmin, loaded: roleLoaded } = useRole();
  // Deleting a job (D-020): the server says when a finalized report is involved and then wants the site name typed back.
  const [deleting, setDeleting] = useState(false);
  const [needName, setNeedName] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function sendDelete(rowId: string, confirmName?: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch("/api/assessments/" + rowId, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(confirmName ? { confirmName } : {}) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; needsConfirmName?: boolean };
      if (res.status === 400 && data.needsConfirmName) {
        setNeedName(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not delete the job");
      router.replace("/jobs" as never);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function askDelete(rowId: string) {
    Alert.alert("Delete this job?", "Its checklist, pictures, audio, findings and notes are removed for good. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void sendDelete(rowId) },
    ]);
  }

  async function chooseScenario(rowId: string, scenario: Scenario) {
    setSettingScenario(true);
    try {
      const res = await apiFetch("/api/assessments/" + rowId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { scenario } }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the situation");
      await fetchDetail();
    } catch (e) {
      Alert.alert("Couldn't set the situation", e instanceof Error ? e.message : String(e));
    } finally {
      setSettingScenario(false);
    }
  }

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    if (!hasSupabaseEnv()) {
      // Not connected — show a sample job so the screen is still walkable
      setState({ kind: "ready", row: { id: String(id), workspace_id: "demo", site_id: null, mode: "assessment", pack: "solar", status: "draft", context: { siteName: String(id).slice(0, 8) }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sites: { name: String(id).slice(0, 12), address: "Sample job" } } as AssessmentRow });
      return;
    }
    const supabase = getSupabase()!;
    // Only the first load shows the full-screen spinner — refetching on focus must not unmount the screen and discard in-progress work.
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    try {
      const { data, error } = await supabase.from("assessments").select("id, workspace_id, site_id, mode, pack, status, context, created_at, updated_at, sites(name, address)").eq("id", id).single();
      if (error) throw new Error(error.message);
      setState({ kind: "ready", row: data as unknown as AssessmentRow });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useFocusEffect(useCallback(() => { fetchDetail(); setItemsTick((n) => n + 1); }, [fetchDetail]));

  // Load the stored checklist (ids are real, so edits keep responses and evidence links).
  useEffect(() => {
    if (!readyId) return;
    let cancelled = false;
    (async () => {
      try {
        apiBase();
        const [res, respRes] = await Promise.all([apiFetch("/api/checklist/items?assessmentId=" + readyId), apiFetch("/api/checklist/responses?assessmentId=" + readyId)]);
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; title: string; required: boolean; category?: string }>; error?: string };
        const respData = (await respRes.json().catch(() => ({}))) as { responses?: Array<{ itemId: string; status: string }>; error?: string };
        if (!res.ok || !respRes.ok) {
          setItemsError((!res.ok ? data.error : respData.error) ?? `The server answered with an error (${!res.ok ? res.status : respRes.status}).`);
          setItemsState("error");
          return;
        }
        const list = data.items ?? [];
        setStoredItems(list);
        setStoredResponses(respData.responses ?? []);
        setItemsState(list.length > 0 ? "ready" : "empty");
      } catch (e) {
        if (cancelled) return;
        setItemsError(e instanceof Error ? e.message : String(e));
        setItemsState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [readyId, itemsTick]);

  const reloadItems = () => {
    setItemsState("loading");
    setItemsError(null);
    setItemsTick((n) => n + 1);
  };

  if (state.kind === "loading") return <Screen><Stack.Screen options={{ title: "Job" }} /><Loading label="Loading job…" /></Screen>;
  if (state.kind === "error") return <Screen><Stack.Screen options={{ title: "Job" }} /><ErrorState title="Couldn't load this job" message={state.message} onRetry={fetchDetail} /></Screen>;

  const row = state.row;
  const system = systemLabel(row.pack);
  const scenario = scenarioFor(row.mode, row.context?.scenario);
  const items = storedItems ?? [];
  const startHere = startHereFor(row.context?.intake as IntakeSummary | undefined, items);
  const siteName = siteNameOf(row);
  const status = statusTone(row.status);
  const base = `/assessments/${row.id}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: capitalize(row.mode) }} />

      <View style={{ backgroundColor: colors.brand, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon name={systemIcon(row.pack)} size={16} color={colors.accent} />
          <Text variant="overline" color={colors.textSubtle} style={{ flex: 1 }}>System: {system} · {capitalize(row.mode)} · {scenarioLabel(scenario)}</Text>
          <View style={{ backgroundColor: tones[status.tone].bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: tones[status.tone].fg }}>{status.label}</Text>
          </View>
        </View>
        <Text variant="display" color={colors.textOnDark}>{siteName}</Text>
        {row.sites?.address ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="location-outline" size={14} color={colors.textOnDarkMuted} />
            <Text variant="caption" color={colors.textOnDarkMuted} style={{ flex: 1 }}>{row.sites.address}</Text>
          </View>
        ) : null}
        <Text variant="caption" color={colors.textSubtle}>Updated {timeAgo(row.updated_at)}</Text>
      </View>

      {scenario === null ? (
        <Card>
          <SectionHeader title="What's the situation at the site?" subtitle="This tells the app and the AI whether to survey for a new installation or check what is already there. It can be set once." />
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {SCENARIO_LIST.map((s) => (
              <Button key={s.id} title={s.label} variant="secondary" size="sm" loading={settingScenario} onPress={() => void chooseScenario(row.id, s.id)} />
            ))}
          </View>
        </Card>
      ) : null}

      {startHere ? <Banner tone="info" title={`Start here: ${startHere.title}`} message={startHere.reason || "Suggested by the site intake."} /> : null}

      {/* Working on site comes first: no scrolling past the checklist to start a live session. */}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Link href={`${base}/live` as never} asChild>
          <Button title="Live session (beta)" icon="videocam-outline" variant="accent" style={{ flex: 1 }} />
        </Link>
        <Link href={`${base}/intake` as never} asChild>
          <Button title={row.context?.intake ? "Site intake again" : "Site intake"} icon="sparkles-outline" variant="secondary" style={{ flex: 1 }} />
        </Link>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Link href={`${base}/checklist` as never} asChild><NavTile icon="checkbox-outline" label="Checklist" badge={items.length ? `${items.length} items` : undefined} /></Link>
        <Link href={`${base}/evidence` as never} asChild><NavTile icon="images-outline" label="Evidence" /></Link>
        <Link href={`${base}/findings` as never} asChild><NavTile icon="flag-outline" label="Findings" /></Link>
        <Link href={`${base}/materials` as never} asChild><NavTile icon="cube-outline" label="Materials" /></Link>
        <Link href={`${base}/completeness` as never} asChild><NavTile icon="pie-chart-outline" label="Progress" /></Link>
        <Link href={`${base}/report` as never} asChild><NavTile icon="document-text-outline" label="Report" /></Link>
      </View>

      <Card>
        <SectionHeader
          title="Checklist"
          subtitle={`Started from the ${system} ${scenario === "new_install" ? "site-survey" : "condition"} template. Tap an item to check it; Edit to add, remove or reorder.`}
          action={<Link href={`${base}/checklist-builder` as never} asChild><Button title="Edit" icon="create-outline" variant="secondary" size="sm" /></Link>}
        />
        {itemsState === "loading" ? <Loading /> : null}
        {itemsState === "error" ? <ErrorState title="Couldn't load the checklist" message={itemsError ?? "Check your connection and try again."} onRetry={reloadItems} /> : null}
        {itemsState === "empty" ? (
          <EmptyState icon="list-outline" title="No checklist yet" message="Set up the items you'll check on site." action={<Link href={`${base}/checklist-builder` as never} asChild><Button title="Build checklist" icon="add" variant="accent" size="sm" /></Link>} />
        ) : null}
        {itemsState === "ready" ? <ChecklistSummaryMobile items={items} responses={storedResponses} base={base} /> : null}
      </Card>

      <MeasurementsPanelMobile assessmentId={row.id} items={items.map((i) => ({ id: i.id, title: i.title }))} />

      <FieldCaptureMobile assessmentId={row.id} items={items.map((i) => ({ id: i.id, title: i.title }))} />

      <AiDraftPanelMobile assessmentId={row.id} pack={row.pack} mode={row.mode} />

      <Card>
        <SectionHeader title="Report" subtitle="Built from your checklist, findings and photos. Finalizing locks a copy — later edits create a new version." />
        <Link href={`${base}/report?prepare=1` as never} asChild><Button title="Preview report" icon="eye-outline" variant="accent" /></Link>
      </Card>

      {roleLoaded && isAdmin ? (
        <Card>
          <SectionHeader title="Danger zone" subtitle="Deleting a job removes its checklist, pictures, audio, findings, notes and reports for good." />
          {needName ? (
            <>
              <Banner tone="danger" title="This job has a finalized report" message={`The signed report will be destroyed with it. Type the site name "${siteName}" to confirm.`} />
              <Field label="Site name" value={typedName} onChangeText={setTypedName} placeholder={siteName} autoCapitalize="none" />
              <Button
                title="Delete job and report"
                icon="trash-outline"
                variant="danger"
                loading={deleting}
                disabled={typedName.trim().toLowerCase() !== siteName.trim().toLowerCase()}
                onPress={() => void sendDelete(row.id, typedName)}
              />
              <Button title="Cancel" variant="ghost" onPress={() => { setNeedName(false); setTypedName(""); }} />
            </>
          ) : (
            <Button title="Delete job" icon="trash-outline" variant="danger" loading={deleting} onPress={() => askDelete(row.id)} />
          )}
          {deleteError ? <Banner tone="danger" message={deleteError} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
