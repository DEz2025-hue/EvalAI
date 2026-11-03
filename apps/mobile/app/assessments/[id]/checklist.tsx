import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { AnswerSync, needsMeasurement, parseMeasurement, responseProblem } from "@eval-ai/shared";
import { apiFetch, apiBase } from "../../../lib/api";
import { CHECK_STATUSES, checkStatus, colors, radius, space } from "../../../lib/theme";
import { PhotoCaptureMobile } from "../../../components/PhotoCaptureMobile";
import { Badge, Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, ProgressBar, Screen, Text } from "../../../components/ui";

type Source = "established" | "user" | "ai_suggested";
type Item = { id: string; title: string; required: boolean; instructions?: string; source?: Source; rationale?: string };
/** `updatedAt` is when this answer was last saved (absent = never): sent back so a newer answer elsewhere isn't overwritten. */
type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string; updatedAt?: string };
type Filter = "all" | "todo" | "required";
type SaveState = "idle" | "unsaved" | "saving" | "saved";

/** An answer is saved this long after the last change, and always before moving to another item. */
const AUTOSAVE_MS = 1500;

export default function MobileChecklistDetail() {
  const { id, item } = useLocalSearchParams<{ id: string; item?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Record<string, Resp>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [measureOpen, setMeasureOpen] = useState<Set<string>>(new Set());
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // What was typed in each measurement field, so unfinished input like "2." or "0," stays on screen while typing.
  const [measureText, setMeasureText] = useState<Record<string, string>>({});
  // The latest answers for saves started from timers and taps (state in a closure can be a render behind).
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const sync = useMemo(
    () =>
      new AnswerSync(async (answer) => {
        const res = await apiFetch("/api/checklist/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: String(id), responses: [answer] }) });
        const data = (await res.json().catch(() => ({}))) as { error?: string; updatedAt?: string };
        return res.ok ? { ok: true as const, updatedAt: data.updatedAt ?? new Date().toISOString() } : { ok: false as const, status: res.status, error: data.error ?? "Save failed" };
      }),
    [id],
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        apiBase();
        const res = await apiFetch(`/api/assessments/${String(id)}`);
        const data = (await res.json().catch(() => ({}))) as { checklist?: Item[]; responses?: Resp[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? `The server answered with an error (${res.status}).`);
        // Real items only: template rows with made-up ids can't be saved, so answers typed into them would be lost.
        const list = data.checklist ?? [];
        const rList = data.responses ?? [];
        const map: Record<string, Resp> = {};
        for (const it of list) map[it.id] = rList.find((r) => r.itemId === it.id) ?? { itemId: it.id, status: "not_checked" };
        sync.load(rList, list.map((it) => it.id));
        setItems(list);
        setResponses(map);
        // Open at the item tapped on the job screen, otherwise at the first one not checked yet.
        const at = item ? list.findIndex((it) => it.id === item) : list.findIndex((it) => map[it.id].status === "not_checked");
        setIdx(at >= 0 ? at : 0);
      } catch (e) {
        setItems([]);
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the start item only matters on the first load
  }, [id, loadTick, sync]);

  const cur = items[idx];
  const curResp = cur ? responses[cur.id] ?? { itemId: cur.id, status: "not_checked" } : null;
  const checked = items.filter((it) => (responses[it.id]?.status ?? "not_checked") !== "not_checked").length;

  function update(patch: Partial<Resp>) {
    if (!cur) return;
    setResponses((m) => ({ ...m, [cur.id]: { ...m[cur.id], ...patch } }));
    sync.edited(cur.id);
    setSaveState("unsaved");
    setProblem(null);
  }

  /** After a refused save: replace this item's answer with the one saved elsewhere (the edits on screen are dropped). */
  async function loadLatest(itemId: string) {
    try {
      const res = await apiFetch(`/api/checklist/responses?assessmentId=${String(id)}`);
      const data = (await res.json().catch(() => ({}))) as { responses?: Resp[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load the latest answer");
      const latest = (data.responses ?? []).find((r) => r.itemId === itemId) ?? { itemId, status: "not_checked" };
      sync.adopt(itemId, latest.updatedAt);
      setResponses((m) => ({ ...m, [itemId]: latest }));
      setMeasureText((m) => {
        const next = { ...m };
        delete next[itemId];
        return next;
      });
      setSaveState("saved");
    } catch (e) {
      Alert.alert("Couldn't load", e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Save one item if it has unsaved changes. `showRules` is false for autosave: an answer that doesn't meet the rules yet
   * (a value typed before its unit) simply waits, and the rule is shown when the person moves on.
   */
  async function saveItem(itemId: string, showRules: boolean): Promise<boolean> {
    if (!sync.isDirty(itemId)) return true;
    const it = items.find((x) => x.id === itemId);
    const r = responsesRef.current[itemId];
    if (!it || !r) return true;
    const rule = responseProblem(r, it);
    if (rule) {
      if (showRules) setProblem(rule);
      return false;
    }
    try {
      apiBase();
    } catch {
      if (showRules) setProblem("You're offline from the server — this answer stays on this screen until you reconnect.");
      return false;
    }
    setSaveState("saving");
    const result = await sync.save({ itemId, status: r.status, notes: r.notes, measuredValue: r.measuredValue, measuredUnit: r.measuredUnit });
    if (result.ok) {
      setSaveState(sync.isDirty(itemId) ? "unsaved" : "saved");
      return true;
    }
    setSaveState("unsaved");
    if (result.conflict) {
      Alert.alert("Changed somewhere else", result.error, [
        { text: "Cancel", style: "cancel" },
        { text: "Load the latest", onPress: () => void loadLatest(itemId) },
      ]);
    } else {
      setProblem(result.error);
    }
    return false;
  }

  // Autosave after a short pause in typing or tapping.
  useEffect(() => {
    if (!cur || !sync.isDirty(cur.id)) return;
    const t = setTimeout(() => void saveItem(cur.id, false), AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-armed on every answer change
  }, [responses, cur?.id]);

  // Going back with an unsaved answer would lose it: save first, and only stay if that fails.
  useEffect(() => {
    // expo-router's useNavigation() is typed for its own events; beforeRemove is React Navigation's, available on the same object.
    const nav = navigation as unknown as {
      addListener(event: "beforeRemove", cb: (e: { preventDefault(): void; data: { action: unknown } }) => void): () => void;
      dispatch(action: unknown): void;
    };
    return nav.addListener("beforeRemove", (e) => {
      if (!cur || !sync.isDirty(cur.id)) return;
      e.preventDefault();
      void saveItem(cur.id, true).then((ok) => {
        if (ok) nav.dispatch(e.data.action);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bound with the current item
  }, [navigation, cur?.id, responses]);

  async function go(to: number) {
    if (to === idx || to < 0 || to >= items.length) return;
    if (cur && !(await saveItem(cur.id, true))) return;
    setIdx(to);
    setListOpen(false);
    setPhotoOpen(false);
    setPhotoNote(null);
  }

  async function finish() {
    if (cur && !(await saveItem(cur.id, true))) return;
    router.replace(`/assessments/${String(id)}/completeness` as never);
  }

  if (loading) return <Screen><Stack.Screen options={{ title: "Checklist" }} /><Loading label="Loading checklist…" rows={6} /></Screen>;
  if (loadError) return <Screen><Stack.Screen options={{ title: "Checklist" }} /><ErrorState title="Couldn't load the checklist" message={loadError} onRetry={() => setLoadTick((n) => n + 1)} /></Screen>;
  if (!cur || !curResp) return <Screen><Stack.Screen options={{ title: "Checklist" }} /><EmptyState icon="list-outline" title="No checklist items" action={<Button title="Build checklist" variant="accent" size="sm" onPress={() => router.replace(`/assessments/${String(id)}/checklist-builder` as never)} />} /></Screen>;

  const last = idx >= items.length - 1;
  const showMeasure = needsMeasurement(cur.title) || curResp.measuredValue !== undefined || measureOpen.has(cur.id);
  const savedLabel = saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Not saved yet" : saveState === "saved" ? "Saved" : "";
  const visible = items
    .map((it, i) => ({ it, i, status: responses[it.id]?.status ?? "not_checked" }))
    .filter(({ it, status }) => filter === "all" || (status === "not_checked" && (filter === "todo" || it.required)));

  return (
    <>
      <Stack.Screen options={{ title: `Item ${idx + 1} of ${items.length}` }} />
      <Screen>
        <View style={{ gap: space.xs }}>
          <ProgressBar value={checked} total={items.length} />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="caption" style={{ flex: 1 }}>{checked} of {items.length} checked</Text>
            <Text variant="caption" color={saveState === "unsaved" ? colors.warning : colors.textSubtle} accessibilityLiveRegion="polite">{savedLabel}</Text>
          </View>
        </View>

        <Button title={listOpen ? "Hide all items" : "All items"} icon="list-outline" variant="secondary" size="sm" onPress={() => setListOpen((o) => !o)} />
        {listOpen ? (
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {([["all", "All"], ["todo", "Not checked"], ["required", "Required, not checked"]] as const).map(([f, l]) => (
                <Chip key={f} label={l} active={filter === f} onPress={() => setFilter(f)} />
              ))}
            </View>
            <View style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, overflow: "hidden" }}>
              {visible.map(({ it, i, status }, n) => {
                const s = checkStatus(status);
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => void go(i)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: i === idx }}
                    accessibilityLabel={`Item ${i + 1}, ${it.title}, ${s.label}`}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, borderTopWidth: n === 0 ? 0 : 1, borderTopColor: colors.divider, backgroundColor: pressed || i === idx ? colors.surfaceMuted : colors.surface })}
                  >
                    <Text variant="caption" style={{ width: 22 }}>{i + 1}</Text>
                    <Text variant={i === idx ? "bodyStrong" : "body"} style={{ flex: 1 }} numberOfLines={2}>{it.title}</Text>
                    {it.required && status === "not_checked" ? <Badge label="Required" tone="danger" /> : null}
                    <Badge label={s.label} tone={s.tone} />
                  </Pressable>
                );
              })}
              {visible.length === 0 ? <Text variant="caption" style={{ padding: space.md }}>Nothing left in this list.</Text> : null}
            </View>
          </Card>
        ) : null}

        <Card style={{ gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Badge label={cur.required ? "Required" : "Optional"} tone={cur.required ? "danger" : "neutral"} />
              {cur.source === "ai_suggested" ? <Badge label="AI suggestion" tone="warning" /> : cur.source === "user" ? <Badge label="Added by you" tone="accent" /> : null}
            </View>
            <Text variant="title">{cur.title}</Text>
            {cur.instructions ? (
              <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: space.md }}>
                <Text variant="body"><Text variant="bodyStrong">Look for: </Text>{cur.instructions}</Text>
              </View>
            ) : null}
            {cur.rationale ? <Text variant="caption">Why: {cur.rationale}</Text> : null}
          </View>

          <View style={{ gap: space.sm }}>
            <Text variant="label" color={colors.text}>Result</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {CHECK_STATUSES.map((s) => (
                <Chip key={s.value} label={s.label} icon={s.icon} tone={s.tone} active={curResp.status === s.value} onPress={() => update({ status: s.value })} />
              ))}
            </View>
            {curResp.status === "not_applicable" && cur.required ? <Text variant="caption" color={colors.warning}>Add a note explaining why this doesn't apply.</Text> : null}
          </View>

          <Field label="Notes" value={curResp.notes ?? ""} onChangeText={(v) => update({ notes: v })} placeholder="What did you see?" multiline />

          {showMeasure ? (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 2 }}>
                <Field
                  label="Measurement"
                  keyboardType="decimal-pad"
                  value={measureText[cur.id] ?? (curResp.measuredValue !== undefined ? String(curResp.measuredValue) : "")}
                  onChangeText={(v) => {
                    setMeasureText((m) => ({ ...m, [cur.id]: v }));
                    update({ measuredValue: parseMeasurement(v) });
                  }}
                  placeholder="Value"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Unit" value={curResp.measuredUnit ?? ""} onChangeText={(v) => update({ measuredUnit: v })} placeholder="m, kW" />
              </View>
            </View>
          ) : (
            <Button title="Add a measurement" icon="resize-outline" variant="ghost" size="sm" onPress={() => setMeasureOpen((s) => new Set(s).add(cur.id))} />
          )}

          {photoOpen ? (
            <View style={{ gap: space.sm }}>
              <Text variant="label" color={colors.text}>Photos for this item</Text>
              <PhotoCaptureMobile key={cur.id} assessmentId={String(id)} itemId={cur.id} onUploaded={(n) => setPhotoNote(`${n} photo${n === 1 ? "" : "s"} saved and linked to this item.`)} />
              {photoNote ? <Banner tone="success" message={photoNote} /> : null}
            </View>
          ) : (
            <Button title="Add a photo to this item" icon="camera-outline" variant="secondary" size="sm" onPress={() => setPhotoOpen(true)} />
          )}

          {problem ? <Banner tone="danger" message={problem} /> : null}
        </Card>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="Previous" icon="chevron-back" variant="secondary" onPress={() => void go(idx - 1)} disabled={idx === 0 || saveState === "saving"} style={{ flex: 1 }} />
          {last ? (
            <Button title="Finish" icon="checkmark" variant="accent" onPress={() => void finish()} disabled={saveState === "saving"} style={{ flex: 1 }} />
          ) : (
            <Button title="Next" icon="chevron-forward" variant="accent" onPress={() => void go(idx + 1)} disabled={saveState === "saving"} style={{ flex: 1 }} />
          )}
        </View>

        <Button title="Edit checklist items" icon="create-outline" variant="ghost" size="sm" onPress={() => router.push(`/assessments/${String(id)}/checklist-builder` as never)} />
        <Text variant="caption" color={colors.textSubtle} style={{ textAlign: "center" }}>Answers save on their own. Items you haven't checked never count as passed.</Text>
      </Screen>
    </>
  );
}
