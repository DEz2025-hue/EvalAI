import { useState } from "react";
import { Image, View } from "react-native";
import { SCENARIOS, acceptAll, buildIntakeSummary, mergeIntake, type ChecklistItemLike, type IntakeMode, type IntakeResult, type Scenario } from "@eval-ai/shared";
import type { IntakeDeps, IntakePhoto } from "../lib/intakeApi";
import { colors, radius, space } from "../lib/theme";
import { VoiceRecorderMobile } from "./VoiceRecorderMobile";
import { Badge, Banner, Button, Card, Field, IconButton, Loading, OptionCard, SectionHeader, Text } from "./ui";

const MAX_PHOTOS = 20;
/** With many photos the AI copies are made smaller so the whole request stays under the server's ~4.5 MB body limit. */
const aiCopySide = (count: number) => (count > 8 ? 768 : 1024);

type Phase = "input" | "working" | "review" | "done" | "failed";
type Review = { items: ChecklistItemLike[]; result: IntakeResult; evidenceIds: string[]; description: string; newItems: Set<number>; updates: Set<string> };

const PROMPTS: Record<Scenario | "none", string> = {
  new_install: "Describe the site you are going to survey, or take photos of the roof or walls, the spaces and where equipment could go.",
  existing: "Describe the system that is already there, or take photos of the equipment and what is around it.",
  none: "Describe the site, or take photos, so the app can tell you where to start and what to look for.",
};

/**
 * Site intake (D-021). The person describes the site and/or takes photos; the AI suggests where to start and what to look for.
 * Photos are kept as evidence. Suggestions are only ever added to the checklist: in "automatic" mode all at once, in "review"
 * mode the ones the person accepts. Nothing here changes a checklist answer.
 */
export function SiteIntake({ scenario, deps, firstRun, onFinish }: { assessmentId: string; scenario: Scenario | null; deps: IntakeDeps; firstRun: boolean; onFinish: () => void }) {
  const [phase, setPhase] = useState<Phase>("input");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<IntakePhoto[]>([]);
  const [mode, setMode] = useState<IntakeMode>("review");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [applying, setApplying] = useState(false);
  const [doneInfo, setDoneInfo] = useState<{ added: number; updated: number; startHere: string | null } | null>(null);

  const canGuide = description.trim().length > 0 || photos.length > 0;

  async function addPhotos(which: "camera" | "library") {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    try {
      const picked = await deps.pickPhotos(which, room);
      if (picked.length > 0) setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      // A partial pick (some photos skipped) still keeps the good ones; only the message is shown.
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function finish(items: ChecklistItemLike[], result: IntakeResult, choice: { newItems: number[]; guidanceUpdates: string[] }, evidenceIds: string[], text: string) {
    const merged = mergeIntake(items, result, choice);
    if (merged.added > 0 || merged.updated > 0) await deps.saveChecklist(merged.items);
    const summary = buildIntakeSummary({ description: text, result, mode, evidenceIds, added: merged.added, updated: merged.updated });
    await deps.saveSummary(summary);
    setDoneInfo({ added: merged.added, updated: merged.updated, startHere: result.startHere?.title ?? null });
    setPhase("done");
  }

  async function guideMe() {
    setError(null);
    setNotice(null);
    setPhase("working");
    const text = description.trim();
    try {
      // 1. The originals are kept privately as evidence on the job.
      setStep(photos.length ? "Saving your photos…" : "");
      const evidenceIds: string[] = [];
      let failed = 0;
      for (const p of photos) {
        try {
          evidenceIds.push((await deps.savePhoto(p)).evidenceId);
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) setNotice(`${failed} photo${failed > 1 ? "s" : ""} couldn't be saved as evidence. You can add them again from the job.`);

      // 2. Small copies go to the AI. If the AI step fails the photos are still saved.
      setStep("Looking at the site…");
      const images = [];
      for (const p of photos) images.push(await deps.aiCopy(p, aiCopySide(photos.length)));
      const result = await deps.guide({ description: text, images, evidenceIds });
      const items = await deps.loadChecklist();
      if (mode === "auto") {
        setStep("Updating your checklist…");
        await finish(items, result, acceptAll(result), result.evidenceIds, text);
      } else {
        setReview({ items, result, evidenceIds: result.evidenceIds, description: text, newItems: new Set(), updates: new Set() });
        setPhase("review");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  }

  async function applyChosen() {
    if (!review) return;
    setApplying(true);
    setError(null);
    try {
      await finish(review.items, review.result, { newItems: [...review.newItems], guidanceUpdates: [...review.updates] }, review.evidenceIds, review.description);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  if (phase === "working") {
    return (
      <>
        <Loading label={step || "Working…"} />
        <Text variant="caption" style={{ textAlign: "center" }}>This can take up to a minute. Your photos are saved first.</Text>
      </>
    );
  }

  if (phase === "failed") {
    return (
      <>
        <Banner tone="warning" title="The app couldn't guide this job" message={`${error ?? "Something went wrong."} Your standard checklist is ready, and any photos you took are saved.`} />
        {notice ? <Banner tone="neutral" message={notice} /> : null}
        <Button title="Try again" icon="refresh" variant="secondary" onPress={() => setPhase("input")} />
        <Button title="Continue with the standard checklist" icon="arrow-forward" variant="accent" onPress={onFinish} />
      </>
    );
  }

  if (phase === "done") {
    return (
      <>
        <Banner tone="success" title="Your checklist is guided" message={`${doneInfo?.added ?? 0} item${doneInfo?.added === 1 ? "" : "s"} added and ${doneInfo?.updated ?? 0} "look for" note${doneInfo?.updated === 1 ? "" : "s"} sharpened. Added items are marked as AI suggestions and can be removed.`} />
        {doneInfo?.startHere ? <Banner tone="info" title="Start here" message={doneInfo.startHere} /> : null}
        {notice ? <Banner tone="neutral" message={notice} /> : null}
        <Button title="Open the job" icon="arrow-forward" variant="accent" size="lg" onPress={onFinish} />
      </>
    );
  }

  if (phase === "review" && review) {
    const { result, items } = review;
    const titleOf = (id: string) => items.find((i) => i.id === id)?.title ?? "Checklist item";
    const chosen = review.newItems.size + review.updates.size;
    return (
      <>
        <Banner tone="warning" title="AI suggestion — needs your review" message="Choose what to add to your checklist. Nothing is added until you tap Apply." />
        {result.startHere ? (
          <Card>
            <Text variant="overline" color={colors.textSubtle}>Start here</Text>
            <Text variant="heading">{result.startHere.itemId ? titleOf(result.startHere.itemId) : result.startHere.title}</Text>
            {result.startHere.reason ? <Text variant="body">{result.startHere.reason}</Text> : null}
          </Card>
        ) : null}

        {result.newItems.length > 0 ? <SectionHeader title="Items to add" subtitle="Each says what to look for." /> : null}
        {result.newItems.map((n, i) => (
          <Card key={`n${i}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{n.title}</Text>
              {review.newItems.has(i) ? <Badge label="Will add" tone="success" /> : null}
            </View>
            {n.lookFor ? <Text variant="body">Look for: {n.lookFor}</Text> : null}
            {n.why ? <Text variant="caption">Why: {n.why}</Text> : null}
            <Button
              title={review.newItems.has(i) ? "Skip it" : "Add to checklist"}
              size="sm"
              variant={review.newItems.has(i) ? "ghost" : "secondary"}
              onPress={() => setReview({ ...review, newItems: toggle(review.newItems, i) })}
            />
          </Card>
        ))}

        {result.guidanceUpdates.length > 0 ? <SectionHeader title="Sharper guidance" subtitle="Updates the 'look for' text of items already on your list." /> : null}
        {result.guidanceUpdates.map((u) => (
          <Card key={`u${u.itemId}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{titleOf(u.itemId)}</Text>
              {review.updates.has(u.itemId) ? <Badge label="Will update" tone="success" /> : null}
            </View>
            <Text variant="body">Look for: {u.lookFor}</Text>
            <Button
              title={review.updates.has(u.itemId) ? "Skip it" : "Use this"}
              size="sm"
              variant={review.updates.has(u.itemId) ? "ghost" : "secondary"}
              onPress={() => setReview({ ...review, updates: toggle(review.updates, u.itemId) })}
            />
          </Card>
        ))}

        {result.newItems.length === 0 && result.guidanceUpdates.length === 0 ? <Banner tone="neutral" message="The AI had nothing to add to the standard checklist for this site." /> : null}

        {result.visible.length > 0 || result.limitations.length > 0 ? (
          <Card>
            {result.visible.length > 0 ? (
              <>
                <Text variant="label" color={colors.text}>What the AI could see</Text>
                {result.visible.map((v, i) => <Text key={`v${i}`} variant="caption">• {v}</Text>)}
              </>
            ) : null}
            {result.limitations.length > 0 ? (
              <>
                <Text variant="label" color={colors.text}>What it can't tell</Text>
                {result.limitations.map((v, i) => <Text key={`l${i}`} variant="caption">• {v}</Text>)}
              </>
            ) : null}
          </Card>
        ) : null}

        {error ? <Banner tone="danger" message={error} /> : null}
        <Button title={chosen > 0 ? `Apply ${chosen} choice${chosen > 1 ? "s" : ""}` : "Continue without adding anything"} icon="checkmark" variant="accent" size="lg" loading={applying} onPress={() => void applyChosen()} />
      </>
    );
  }

  // phase === "input"
  const wording = scenario ? SCENARIOS[scenario] : null;
  return (
    <>
      <SectionHeader title={firstRun ? "Let's guide this job" : "Site intake"} subtitle={wording ? wording.label : undefined} />
      <Text variant="body">{PROMPTS[scenario ?? "none"]}</Text>

      <Card>
        <Field label="Describe the site" value={description} onChangeText={setDescription} multiline placeholder="e.g. Tin roof, two storeys, a big tree on the north-west side, inverter in the garage" />
        <VoiceRecorderMobile
          assessmentId={undefined}
          showTypedNote={false}
          canSend={description.trim().length > 0}
          onSend={() => void guideMe()}
          onTranscript={(t) => setDescription((d) => (d.trim() ? d.trim() + " " + t.trim() : t.trim()))}
        />
      </Card>

      <Card>
        <SectionHeader title={`Photos (${photos.length} of ${MAX_PHOTOS})`} subtitle="Take several, or choose many at once from your gallery. They are saved with the job as evidence." />
        {photos.length > 0 ? (
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <View key={p.uri + i}>
                <Image source={{ uri: p.uri }} style={{ width: 84, height: 112, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} />
                <View style={{ position: "absolute", top: 2, right: 2 }}>
                  <IconButton icon="close" label="Remove photo" onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title={photos.length ? "Take another" : "Take photo"} icon="camera-outline" variant="secondary" size="sm" disabled={photos.length >= MAX_PHOTOS} onPress={() => void addPhotos("camera")} style={{ flex: 1 }} />
          <Button title="Choose photos" icon="images-outline" variant="secondary" size="sm" disabled={photos.length >= MAX_PHOTOS} onPress={() => void addPhotos("library")} style={{ flex: 1 }} />
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <Text variant="label" color={colors.text}>What should happen to the suggestions?</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <OptionCard icon="eye-outline" title="Let me review each one" subtitle="You choose what is added" selected={mode === "review"} onPress={() => setMode("review")} />
          <OptionCard icon="flash-outline" title="Add them for me" subtitle="Added to the list, marked as AI suggestions" selected={mode === "auto"} onPress={() => setMode("auto")} />
        </View>
      </View>

      {error ? <Banner tone="danger" message={error} /> : null}
      <Text variant="caption">The AI only suggests what to look for. It never fills in checklist answers.</Text>
      <Button title="Guide me" icon="sparkles-outline" variant="accent" size="lg" disabled={!canGuide} onPress={() => void guideMe()} />
      <Button title={firstRun ? "Skip, use the standard checklist" : "Cancel"} variant="ghost" onPress={onFinish} />
    </>
  );
}
