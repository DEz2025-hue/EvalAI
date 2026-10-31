import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, Link, Stack, useFocusEffect } from "expo-router";
import { getSupabase, hasSupabaseEnv } from "../../lib/supabase";
import { apiFetch, apiBase } from "../../lib/api";
import { capitalize, siteNameOf, timeAgo } from "../../lib/format";
import { systemIcon, systemLabel } from "../../lib/packs";
import { colors, radius, space, statusTone, tones } from "../../lib/theme";
import { ChecklistEditorMobile } from "../../components/ChecklistEditorMobile";
import { FieldCaptureMobile } from "../../components/FieldCaptureMobile";
import { MeasurementsPanelMobile } from "../../components/MeasurementsPanelMobile";
import { AiDraftPanelMobile } from "../../components/AiDraftPanelMobile";
import { Banner, Button, Card, EmptyState, ErrorState, Icon, Loading, NavTile, Screen, SectionHeader, Text } from "../../components/ui";
import type { AssessmentRow } from "../../lib/types";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; row: AssessmentRow };

export default function AssessmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [storedItems, setStoredItems] = useState<Array<{ id: string; title: string; required: boolean; category?: string }> | null>(null);
  const [itemsState, setItemsState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [itemsTick, setItemsTick] = useState(0);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const readyId = state.kind === "ready" ? state.row.id : null;

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
        const res = await apiFetch("/api/checklist/items?assessmentId=" + readyId);
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; title: string; required: boolean; category?: string }>; error?: string };
        if (!res.ok) {
          setItemsError(data.error ?? `The server answered with an error (${res.status}).`);
          setItemsState("error");
          return;
        }
        const list = data.items ?? [];
        setStoredItems(list);
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
  const items = storedItems ?? [];
  const siteName = siteNameOf(row);
  const status = statusTone(row.status);
  const base = `/assessments/${row.id}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: capitalize(row.mode) }} />

      <View style={{ backgroundColor: colors.brand, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon name={systemIcon(row.pack)} size={16} color={colors.accent} />
          <Text variant="overline" color={colors.textSubtle} style={{ flex: 1 }}>System: {system} · {capitalize(row.mode)}</Text>
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
          subtitle={`Started from the ${system} template — add, remove or reorder items as needed.`}
          action={<Link href={`${base}/checklist-builder` as never} asChild><Button title="Edit" icon="create-outline" variant="secondary" size="sm" /></Link>}
        />
        {itemsState === "loading" ? <Loading /> : null}
        {itemsState === "error" ? <ErrorState title="Couldn't load the checklist" message={itemsError ?? "Check your connection and try again."} onRetry={reloadItems} /> : null}
        {itemsState === "empty" ? (
          <EmptyState icon="list-outline" title="No checklist yet" message="Set up the items you'll check on site." action={<Link href={`${base}/checklist-builder` as never} asChild><Button title="Build checklist" icon="add" variant="accent" size="sm" /></Link>} />
        ) : null}
        {itemsState === "ready" ? <ChecklistEditorMobile key={items.map((i) => i.id).join(",")} items={items} assessmentId={row.id} /> : null}
      </Card>

      <MeasurementsPanelMobile assessmentId={row.id} items={items.map((i) => ({ id: i.id, title: i.title }))} />

      <FieldCaptureMobile assessmentId={row.id} items={items.map((i) => ({ id: i.id, title: i.title }))} />

      <AiDraftPanelMobile assessmentId={row.id} pack={row.pack} mode={row.mode} />

      <Card>
        <SectionHeader title="Report" subtitle="Built from your checklist, findings and photos. Finalizing locks a copy — later edits create a new version." />
        <Link href={`${base}/report` as never} asChild><Button title="Preview report" icon="eye-outline" variant="accent" /></Link>
      </Card>

      <Link href={`${base}/live` as never} asChild>
        <Button title="Live camera (coming soon)" icon="videocam-outline" variant="ghost" size="sm" />
      </Link>
    </Screen>
  );
}
