import { useState } from "react";
import { Text, View } from "react-native";
import { apiFetch } from "../lib/api";
import { useRole } from "../lib/role";
import { PhotoCaptureMobile } from "./PhotoCaptureMobile";
import { VoiceRecorderMobile } from "./VoiceRecorderMobile";
import { ItemChips, type ChipItem } from "./ItemChips";

type Resp = { itemId: string; status: string; notes?: string; measuredValue?: number; measuredUnit?: string };

/**
 * Photo + voice capture tied to the job. Evidence can be linked to a checklist item, and a CONFIRMED
 * voice transcript is saved as a note on the chosen item (its status and value are preserved).
 */
export function FieldCaptureMobile({ assessmentId, items }: { assessmentId: string; items: ChipItem[] }) {
  const { canWrite, loaded } = useRole();
  const [photoItem, setPhotoItem] = useState("");
  const [noteItem, setNoteItem] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function saveTranscriptAsNote(text: string, audioUri?: string) {
    setMessage(null);
    if (!noteItem) {
      setMessage({ kind: "error", text: "Choose which checklist item this voice note belongs to, then press Attach again." });
      return;
    }
    try {
      const cur = await apiFetch("/api/checklist/responses?assessmentId=" + assessmentId);
      const existingList = cur.ok ? (((await cur.json()) as { responses?: Resp[] }).responses ?? []) : [];
      const existing = existingList.find((r) => r.itemId === noteItem);
      const notes = [existing?.notes, "[Voice note " + new Date().toLocaleString() + (audioUri ? " · audio kept" : "") + "] " + text.trim()].filter(Boolean).join("\n").slice(0, 2000);
      const res = await apiFetch("/api/checklist/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId, responses: [{ itemId: noteItem, status: existing?.status ?? "not_checked", notes, measuredValue: existing?.measuredValue, measuredUnit: existing?.measuredUnit }] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the note");
      setMessage({ kind: "ok", text: "Voice note saved to the checklist item. Numbers and units still need your verification." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  if (loaded && !canWrite) {
    return (
      <View style={{ backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12 }}>
        <Text style={{ fontSize: 12, color: "#64748b" }}>Your role is read-only — photo and voice capture are for members, admins and owners.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <ItemChips label="Link the next photo to" items={items} value={photoItem} onChange={setPhotoItem} />
      <PhotoCaptureMobile
        assessmentId={assessmentId}
        itemId={photoItem || undefined}
        onUploaded={() => setMessage({ kind: "ok", text: photoItem ? "Photo saved and linked to the checklist item." : "Photo saved to the job." })}
      />
      <ItemChips label="Attach the next voice note to" items={items} value={noteItem} onChange={setNoteItem} allowNone={false} />
      <VoiceRecorderMobile assessmentId={assessmentId} itemId={noteItem || undefined} onTranscript={(t, uri) => void saveTranscriptAsNote(t, uri)} />
      {message ? (
        <View style={{ backgroundColor: message.kind === "ok" ? "#f0fdf4" : "#fef2f2", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 12, color: message.kind === "ok" ? "#166534" : "#b91c1c" }}>{message.text}</Text>
        </View>
      ) : null}
    </View>
  );
}
