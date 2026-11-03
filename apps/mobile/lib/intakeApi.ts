import * as ImagePicker from "expo-image-picker";
import type { ChecklistItemLike, IntakeResult, IntakeSummary } from "@eval-ai/shared";
import { apiFetch, apiBase } from "./api";
import { uploadEvidence } from "./upload";
import { toLiveFrame, discardFile } from "./liveSource";

/** Everything the site-intake screen needs from the phone and the server. The screen takes these as props so it can be tested with fakes. */
export type IntakePhoto = { uri: string; name: string; mime: string };

export type IntakeDeps = {
  /** Camera: one photo per tap. Library: the person can pick several at once, up to `max`. Empty list = cancelled. */
  pickPhotos(which: "camera" | "library", max: number): Promise<IntakePhoto[]>;
  /** Keeps the original as private evidence on the job (not tied to one item) and returns its evidence id. */
  savePhoto(photo: IntakePhoto): Promise<{ evidenceId: string }>;
  /** A small JPEG copy (long side `maxSide`, default 1024 px) for the AI. Removed from the phone once used. */
  aiCopy(photo: IntakePhoto, maxSide?: number): Promise<{ imageBase64: string; mimeType: string }>;
  guide(body: { description: string; images: Array<{ imageBase64: string; mimeType: string }>; evidenceIds: string[] }): Promise<IntakeResult & { evidenceIds: string[] }>;
  loadChecklist(): Promise<ChecklistItemLike[]>;
  saveChecklist(items: ChecklistItemLike[]): Promise<void>;
  saveSummary(summary: IntakeSummary): Promise<void>;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

async function readError(res: Response, fallback: string): Promise<Error> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(data.error ?? fallback);
}

export function realIntakeDeps(assessmentId: string): IntakeDeps {
  return {
    async pickPhotos(which, max) {
      if (max <= 0) return [];
      const perm = which === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") throw new Error("Allow camera or photo access in Settings to add photos.");
      const res =
        which === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false, allowsMultipleSelection: true, selectionLimit: max, orderedSelection: true });
      if (res.canceled) return [];
      const photos: IntakePhoto[] = [];
      let skipped = 0;
      for (const [i, a] of res.assets.slice(0, max).entries()) {
        if ((a.mimeType && !ALLOWED.includes(a.mimeType)) || (a.fileSize ?? 0) > MAX_BYTES) {
          skipped += 1;
          continue;
        }
        photos.push({ uri: a.uri, name: a.fileName ?? `site-${Date.now()}-${i}.jpg`, mime: a.mimeType ?? "image/jpeg" });
      }
      if (photos.length === 0 && skipped > 0) throw new Error("Only JPEG, PNG or WebP photos under 15 MB can be used.");
      if (skipped > 0) throw new Error(`${skipped} photo${skipped > 1 ? "s were" : " was"} skipped (only JPEG, PNG or WebP under 15 MB). The others were added.`);
      return photos;
    },
    async savePhoto(photo) {
      const up = await uploadEvidence({ assessmentId, uri: photo.uri, fileName: photo.name, mimeType: photo.mime });
      return { evidenceId: up.id };
    },
    async aiCopy(photo, maxSide) {
      const frame = await toLiveFrame(photo.uri, maxSide);
      discardFile(frame.uri);
      return { imageBase64: frame.base64, mimeType: "image/jpeg" };
    },
    async guide(body) {
      apiBase();
      const res = await apiFetch("/api/ai/site-intake", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ assessmentId, ...body }) });
      if (!res.ok) throw await readError(res, "The AI couldn't guide this job right now.");
      return (await res.json()) as IntakeResult & { evidenceIds: string[] };
    },
    async loadChecklist() {
      const res = await apiFetch("/api/assessments/" + assessmentId);
      if (!res.ok) throw await readError(res, "Could not load the checklist");
      const data = (await res.json().catch(() => ({}))) as { checklist?: ChecklistItemLike[] };
      return (data.checklist ?? []).map((it) => ({ ...it, source: it.source ?? "established" }));
    },
    async saveChecklist(items) {
      const res = await apiFetch("/api/checklist/items", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ assessmentId, items: items.map((it) => ({ id: it.id, title: it.title, instructions: it.instructions, required: it.required, category: it.category, source: it.source, rationale: it.rationale })) }),
      });
      if (!res.ok) throw await readError(res, "Could not save the checklist");
    },
    async saveSummary(summary) {
      const res = await apiFetch("/api/assessments/" + assessmentId, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ context: { intake: summary } }) });
      if (!res.ok) throw await readError(res, "Could not save the intake notes");
    },
  };
}
