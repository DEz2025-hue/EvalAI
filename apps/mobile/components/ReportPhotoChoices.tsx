import { useState } from "react";
import { Image, View } from "react-native";
import { colors, radius, space } from "../lib/theme";
import { Badge, Banner, Button, Card, SectionHeader, Text } from "./ui";

export type ChoicePhoto = {
  evidenceId: string;
  caption: string;
  observations: string[];
  possibleIssues: Array<{ text: string; confidence: string }>;
  cannotTell: string[];
  itemTitle: string | null;
  thumbnail: string | null;
  /** true = add, false = leave out, null = not answered yet. */
  choice: boolean | null;
};

/**
 * "Choose photos for the report" (D-024). Every photo the AI looked at is shown with what it said, and the person answers for
 * each one: add it to the report or leave it out. Nothing is added until it is answered, and Continue waits for every answer.
 */
export function ReportPhotoChoices({ photos, saving, onSubmit, onCancel }: { photos: ChoicePhoto[]; saving: boolean; onSubmit: (choices: Record<string, boolean>) => void; onCancel?: () => void }) {
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(() => Object.fromEntries(photos.map((p) => [p.evidenceId, p.choice])));
  const unanswered = photos.filter((p) => typeof answers[p.evidenceId] !== "boolean").length;
  const set = (id: string, v: boolean) => setAnswers((a) => ({ ...a, [id]: v }));
  const setAll = (v: boolean) => setAnswers(Object.fromEntries(photos.map((p) => [p.evidenceId, v])));

  return (
    <Card>
      <SectionHeader title="Choose photos for the report" subtitle="Say yes or no to each photo. Only the photos you add appear in the report, with the AI's description (not verified) and any possible issues it saw." />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Add all" variant="secondary" size="sm" onPress={() => setAll(true)} style={{ flex: 1 }} />
        <Button title="Leave all out" variant="secondary" size="sm" onPress={() => setAll(false)} style={{ flex: 1 }} />
      </View>
      {photos.map((p, i) => {
        const a = answers[p.evidenceId];
        return (
          <View key={p.evidenceId} style={{ gap: space.xs, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text variant="bodyStrong">Photo {i + 1}</Text>
              {p.itemTitle ? <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>{p.itemTitle}</Text> : <View style={{ flex: 1 }} />}
              {a === true ? <Badge label="Will be added" tone="success" /> : a === false ? <Badge label="Left out" tone="neutral" /> : <Badge label="Your answer needed" tone="warning" />}
            </View>
            {p.thumbnail ? <Image source={{ uri: p.thumbnail }} style={{ width: "100%", height: 180, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} resizeMode="contain" /> : null}
            {p.caption ? <Text variant="body">{p.caption}</Text> : null}
            {p.observations.map((o, j) => <Text key={j} variant="caption">• {o}</Text>)}
            {p.possibleIssues.length > 0 ? (
              <View style={{ gap: 2 }}>
                <Text variant="caption" color={colors.warning}>Possible issues (AI, not verified):</Text>
                {p.possibleIssues.map((x, j) => <Text key={j} variant="caption">• {x.text}</Text>)}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button title="Add to report" icon="add-circle-outline" variant={a === true ? "accent" : "secondary"} size="sm" onPress={() => set(p.evidenceId, true)} style={{ flex: 1 }} />
              <Button title="Leave out" icon="close-circle-outline" variant={a === false ? "primary" : "secondary"} size="sm" onPress={() => set(p.evidenceId, false)} style={{ flex: 1 }} />
            </View>
          </View>
        );
      })}
      {unanswered > 0 ? <Banner tone="info" message={`${unanswered} photo${unanswered > 1 ? "s" : ""} still need${unanswered > 1 ? "" : "s"} your answer.`} /> : null}
      <Button title={saving ? "Saving…" : "Continue"} icon="arrow-forward" variant="accent" loading={saving} disabled={unanswered > 0 || saving} onPress={() => onSubmit(Object.fromEntries(photos.map((p) => [p.evidenceId, answers[p.evidenceId] === true])))} />
      {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={saving} /> : null}
    </Card>
  );
}
