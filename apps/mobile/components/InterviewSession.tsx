import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { appendTurn, canAskMore, endInterview, interviewProgress, newInterview, questionCount, turnsForPrompt, type InterviewState, type InterviewVia } from "@eval-ai/shared";
import { apiFetch } from "../lib/api";
import { appendItemNote } from "../lib/itemNotes";
import { speak, stopSpeaking } from "../lib/speech";
import { colors, space } from "../lib/theme";
import { VoiceRecorderMobile } from "./VoiceRecorderMobile";
import { Badge, Banner, Button, Card, Chip, Field, Icon, Loading, SectionHeader, Text } from "./ui";

const JSON_HEADERS = { "Content-Type": "application/json" };

type Digest = {
  itemNotes: Array<{ itemTitle: string; note: string; quote: string }>;
  findingDrafts: Array<{ title: string; description: string; quotes: string[] }>;
  briefLines: Array<{ label: string; value: string; quote: string }>;
  contradictions: Array<{ statement: string; conflictsWith: string }>;
  openQuestions: string[];
  unverifiedFigures: string[];
};
type Pick<T> = T & { keep: boolean };

/**
 * Site interview (D-030): a turn-based conversation, not a live call. The AI asks one question at a time (read aloud if you like),
 * you answer by voice or typing, and at the end the AI proposes notes that quote your own words. You accept or remove each proposal.
 * Nothing you say changes a checklist status.
 */
export function InterviewSession({ assessmentId, items, initial, onOpenJob, onPrepareReport }: { assessmentId: string; items: Array<{ id: string; title: string }>; initial: InterviewState | null; onOpenJob: () => void; onPrepareReport: () => void }) {
  const [state, setState] = useState<InterviewState | null>(initial);
  const stateRef = useRef<InterviewState | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [aloud, setAloud] = useState(false);
  const [digest, setDigest] = useState<{ notes: Array<Pick<Digest["itemNotes"][number]>>; findings: Array<Pick<Digest["findingDrafts"][number]>>; brief: Array<Pick<Digest["briefLines"][number]>>; rest: Digest } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => stopSpeaking(), []);

  const save = useCallback(
    async (next: InterviewState) => {
      stateRef.current = next;
      setState(next);
      try {
        await apiFetch("/api/assessments/" + assessmentId, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ context: { interview: next } }) });
      } catch {
        /* kept on screen; saved again with the next turn */
      }
    },
    [assessmentId],
  );

  const now = () => new Date().toISOString();
  const id = () => "t" + Date.now() + Math.random().toString(36).slice(2, 6);

  async function askNext(from: InterviewState) {
    setBusy(true);
    setError(null);
    try {
      if (!canAskMore(from)) {
        await save(endInterview(from));
        return;
      }
      const res = await apiFetch("/api/ai/interview", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, turns: turnsForPrompt(from), questionsAsked: questionCount(from) }), timeoutMs: 60_000 });
      const data = (await res.json().catch(() => ({}))) as { question?: string; topic?: string; done?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't ask the next question");
      if (data.done || !data.question) {
        await save(endInterview(from));
        return;
      }
      const r = appendTurn(from, { id: id(), role: "ai", text: data.question, at: now(), topic: data.topic || undefined });
      if (!r.ok) {
        await save(endInterview(from));
        return;
      }
      await save(r.state);
      if (aloud) speak(data.question);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    await askNext(newInterview(now()));
  }

  async function submit(text: string, via: InterviewVia) {
    const cur = stateRef.current;
    if (!cur || !text.trim()) return;
    const r = appendTurn(cur, { id: id(), role: "person", text, at: now(), via });
    if (!r.ok) return;
    stopSpeaking();
    setAnswer("");
    await save(r.state);
    await askNext(r.state);
  }

  async function finish() {
    const cur = stateRef.current;
    if (!cur) return;
    stopSpeaking();
    await save(endInterview(cur));
  }

  async function review() {
    const cur = stateRef.current;
    if (!cur) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/ai/interview/digest", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, turns: cur.turns.map((t) => ({ role: t.role, text: t.text })) }), timeoutMs: 70_000 });
      const data = (await res.json().catch(() => ({}))) as Digest & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't read the interview");
      setDigest({ notes: data.itemNotes.map((x) => ({ ...x, keep: true })), findings: data.findingDrafts.map((x) => ({ ...x, keep: true })), brief: data.briefLines.map((x) => ({ ...x, keep: true })), rest: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const cur = stateRef.current;
    if (!cur || !digest) return;
    setSaving(true);
    setError(null);
    try {
      for (const n of digest.notes.filter((x) => x.keep && x.note.trim())) {
        const item = items.find((i) => i.title === n.itemTitle);
        if (item) await appendItemNote(assessmentId, item.id, `Interview: ${n.note.trim()} (said: "${n.quote}")`);
      }
      for (const f of digest.findings.filter((x) => x.keep)) {
        const res = await apiFetch("/api/findings", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, title: f.title.slice(0, 120), description: `${f.description}\nReported in the interview, not verified. Said: "${f.quotes[0]}"` }) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save a finding");
      }
      const brief = digest.brief.filter((x) => x.keep).map(({ label, value, quote }) => ({ label, value, quote }));
      await save({ ...cur, status: "reviewed", reviewedAt: now(), brief, openQuestions: digest.rest.openQuestions.slice(0, 8) });
      setDigest(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const last = state?.turns[state.turns.length - 1];
  const waitingForAnswer = state?.status === "active" && last?.role === "ai";
  const progress = state ? interviewProgress(state) : null;

  // ---- Start ----
  if (!state || state.turns.length === 0) {
    return (
      <Card>
        <SectionHeader title="Interview" subtitle="The AI asks questions about the job, one at a time. You answer by voice or typing." />
        <Banner tone="info" message="This is a turn-based interview, not a live call. Nothing you say changes a checklist answer: the AI only proposes notes that quote your words, and you accept or remove each one." />
        <Chip label={aloud ? "Reading questions aloud" : "Read questions aloud"} icon="volume-high" active={aloud} onPress={() => setAloud((v) => !v)} />
        {error ? <Banner tone="danger" message={error} /> : null}
        <Button title={busy ? "Starting…" : "Start interview"} icon="chatbubbles-outline" variant="accent" onPress={begin} loading={busy} />
      </Card>
    );
  }

  // ---- Reviewed ----
  if (state.status === "reviewed") {
    return (
      <Card>
        <SectionHeader title="Interview saved" subtitle={`${progress?.answered ?? 0} answers`} />
        <Banner tone="success" message="Accepted notes were added to their checklist items with your words quoted. Findings are drafts that still need review. Site details will appear in the report as statements made in the interview." />
        <Button title="Prepare my report" icon="document-text-outline" variant="accent" onPress={onPrepareReport} />
        <Button title="Back to the job" variant="secondary" onPress={onOpenJob} />
      </Card>
    );
  }

  // ---- Ended: read it ----
  if (state.status === "ended") {
    return (
      <Card>
        <SectionHeader title="Interview finished" subtitle={`${progress?.answered ?? 0} answers`} />
        {!digest ? (
          <>
            {(progress?.answered ?? 0) > 0 ? (
              <>
                <Text variant="body">The AI can read the conversation and propose notes for the checklist, finding drafts and site details. You choose what to keep.</Text>
                {error ? <Banner tone="danger" message={error} /> : null}
                <Button title={busy ? "Reading…" : "Review what I said"} icon="sparkles-outline" variant="accent" onPress={review} loading={busy} />
              </>
            ) : (
              <Text variant="body">No answers were given, so there is nothing to review.</Text>
            )}
            <Button title="Back to the job" variant="secondary" onPress={onOpenJob} />
          </>
        ) : (
          <View style={{ gap: space.md }}>
            <Banner tone="warning" message="AI proposals from your own words. Statements are not verified facts. Untick anything you don't want." />
            {digest.rest.unverifiedFigures.length > 0 ? <Banner tone="warning" message={`Check these figures, you didn't say them: ${digest.rest.unverifiedFigures.join(", ")}.`} /> : null}
            {digest.notes.length > 0 ? <Text variant="bodyStrong">Notes for checklist items</Text> : null}
            {digest.notes.map((n, i) => (
              <Proposal key={"n" + i} keep={n.keep} onToggle={() => setDigest((d) => d && { ...d, notes: d.notes.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)) })} title={n.itemTitle} quote={n.quote}>
                <Field value={n.note} onChangeText={(t) => setDigest((d) => d && { ...d, notes: d.notes.map((x, k) => (k === i ? { ...x, note: t } : x)) })} multiline />
              </Proposal>
            ))}
            {digest.findings.length > 0 ? <Text variant="bodyStrong">Finding drafts (need review)</Text> : null}
            {digest.findings.map((f, i) => (
              <Proposal key={"f" + i} keep={f.keep} onToggle={() => setDigest((d) => d && { ...d, findings: d.findings.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)) })} title={f.title} quote={f.quotes[0]}>
                <Text variant="caption">{f.description}</Text>
              </Proposal>
            ))}
            {digest.brief.length > 0 ? <Text variant="bodyStrong">Details for the report</Text> : null}
            {digest.brief.map((b, i) => (
              <Proposal key={"b" + i} keep={b.keep} onToggle={() => setDigest((d) => d && { ...d, brief: d.brief.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)) })} title={b.label} quote={b.quote}>
                <Text variant="caption">{b.value}</Text>
              </Proposal>
            ))}
            {digest.rest.contradictions.length > 0 ? (
              <Banner tone="warning" title="Things that don't match" message={digest.rest.contradictions.map((c) => `${c.statement} — but: ${c.conflictsWith}`).join("\n")} />
            ) : null}
            {digest.rest.openQuestions.length > 0 ? <Banner tone="neutral" title="Still to check on site" message={digest.rest.openQuestions.join("\n")} /> : null}
            {digest.notes.length + digest.findings.length + digest.brief.length === 0 ? <Text variant="body">Nothing in the conversation was specific enough to propose.</Text> : null}
            {error ? <Banner tone="danger" message={error} /> : null}
            <Button title={saving ? "Saving…" : "Save what I kept"} icon="save-outline" variant="accent" onPress={apply} loading={saving} />
            <Button title="Discard all" variant="ghost" onPress={() => Alert.alert("Discard these proposals?", "The conversation stays saved with the job.", [{ text: "Keep reviewing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => setDigest(null) }])} />
          </View>
        )}
      </Card>
    );
  }

  // ---- Asking ----
  return (
    <Card>
      <SectionHeader title="Interview" subtitle={progress ? `Question ${Math.min(progress.asked, progress.max)} of up to ${progress.max}` : undefined} />
      {busy && !waitingForAnswer ? <Loading label="Thinking of the next question…" /> : null}
      {waitingForAnswer && last ? (
        <View style={{ gap: space.sm }}>
          {last.topic ? <Badge label={last.topic} tone="info" /> : null}
          <Text variant="heading">{last.text}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Chip label={aloud ? "Reading aloud" : "Read aloud"} icon="volume-high" active={aloud} onPress={() => { if (aloud) stopSpeaking(); else speak(last.text); setAloud((v) => !v); }} />
          </View>
          <Field label="Your answer" value={answer} onChangeText={setAnswer} multiline placeholder="Type your answer, or record it below" />
          <Button title="Send answer" icon="send" variant="accent" disabled={!answer.trim() || busy} onPress={() => submit(answer, "text")} />
          <VoiceRecorderMobile assessmentId={assessmentId} showTypedNote={false} attachLabel="Use as my answer" onTranscript={(t) => submit(t, "voice")} />
        </View>
      ) : null}
      {error ? (
        <View style={{ gap: space.sm }}>
          <Banner tone="danger" message={error} />
          {state.status === "active" && last?.role === "person" ? <Button title="Try the next question again" variant="secondary" onPress={() => askNext(state)} /> : null}
        </View>
      ) : null}
      <Button title="That's enough" variant="ghost" onPress={finish} />
      <Text variant="caption" color={colors.textSubtle}>Turn-based interview, not a live call. Your answers are statements, not verified facts.</Text>
    </Card>
  );
}

function Proposal({ keep, onToggle, title, quote, children }: { keep: boolean; onToggle: () => void; title: string; quote?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.divider, opacity: keep ? 1 : 0.5 }}>
      <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: keep }} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
        <Icon name={keep ? "checkbox" : "square-outline"} color={keep ? colors.accent : colors.textMuted} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>{title}</Text>
      </Pressable>
      {children}
      {quote ? <Text variant="caption" color={colors.textSubtle}>You said: “{quote}”</Text> : null}
    </View>
  );
}
